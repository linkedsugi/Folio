/**
 * 정밀 분석 설정 저장소.
 *
 * 회원 저장소(src/lib/auth/member-store.ts)와 같은 모양을 쓴다.
 * 같은 앱에서 저장소가 두 가지 규칙으로 움직이면 "이 배포에서 무엇이 진짜인가" 를
 * 화면마다 다시 따져야 하기 때문이다.
 *
 *  local  — 이 브라우저에만 저장한다. 서버 없는 배포(GitHub Pages)에서 쓴다.
 *           **서버가 없으니 API 키도 없다.** 그래서 keyConfigured 는 언제나 false 이고,
 *           canUseLlm 이 false 가 되어 앱은 규칙 기반으로 동작한다.
 *           이것은 고장이 아니라 이 배포에서 옳은 동작이다.
 *  remote — /api/settings 를 쓴다. 서버가 Google ID 토큰 서명을 검증하고,
 *           바꾸는 일은 관리자에게만 허용한다. 키는 서버 안에서만 읽히고
 *           내려오는 것은 keyConfigured: boolean 뿐이다.
 *
 * 앱은 remote 를 먼저 시도하고, 없으면 local 로 내려간다.
 */
import { DEFAULT_LLM_SETTINGS, normalizeSettings, type LlmSettings } from "./settings";

export interface SettingsStore {
  readonly kind: "local" | "remote";
  get(): Promise<LlmSettings>;
  /** 관리자만 부를 수 있다. 서버 배포에서는 서버가 다시 한 번 권한을 확인한다. */
  set(patch: Partial<LlmSettings>): Promise<LlmSettings>;
}

const KEY = "rolefit-llm-settings";

/* ─────────────────────────────── 기기 저장소 */

function readLocal(): LlmSettings {
  if (typeof localStorage === "undefined") return DEFAULT_LLM_SETTINGS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_LLM_SETTINGS;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return DEFAULT_LLM_SETTINGS;
    }
    // 저장된 값이 깨져 있어도 분석은 계속되어야 한다. 모르는 값은 기본값으로 버틴다.
    return withoutKey(normalizeSettings(parsed as Partial<LlmSettings>));
  } catch {
    return DEFAULT_LLM_SETTINGS;
  }
}

function writeLocal(settings: LlmSettings): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // 저장 공간이 가득 차도 화면은 계속 돌아가야 한다.
  }
}

/**
 * 기기 저장소에는 키가 있을 수 없다.
 * 브라우저에 저장된 값이 keyConfigured: true 라고 주장해도 믿지 않는다 —
 * 그 말을 믿으면 키 없이 모델을 부르려다 매번 실패하고, 사용자는 이유를 알 수 없다.
 */
function withoutKey(settings: LlmSettings): LlmSettings {
  return { ...settings, keyConfigured: false };
}

export const localSettingsStore: SettingsStore = {
  kind: "local",

  async get() {
    return readLocal();
  },

  async set(patch) {
    const current = readLocal();
    const next = withoutKey(
      normalizeSettings({
        ...current,
        ...patch,
        // 바꾼 시각은 기록한다. 관리 화면이 "언제부터 이 설정이었나" 를 말할 수 있어야 한다.
        updatedAt: patch.updatedAt ?? new Date().toISOString(),
        updatedBy: patch.updatedBy ?? current.updatedBy,
      }),
    );
    writeLocal(next);
    return next;
  },
};

/* ─────────────────────────────── 서버 저장소 */

async function call<T>(init: RequestInit & { idToken: string }): Promise<T | null> {
  const { idToken, ...rest } = init;
  try {
    const res = await fetch("/api/settings", {
      ...rest,
      headers: {
        ...(rest.headers ?? {}),
        "content-type": "application/json",
        authorization: `Bearer ${idToken}`,
      },
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    // 정적 배포에서는 404 HTML 이 돌아온다. 그것을 설정으로 착각하지 않는다.
    if (!type.includes("application/json")) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchRemote(idToken: string): Promise<LlmSettings> {
  const data = await call<{ settings: LlmSettings }>({ method: "GET", idToken });
  // 서버에 닿지 못하면 꺼진 상태로 본다. 확인하지 못한 설정으로 자료를 보내지 않는다.
  return data ? normalizeSettings(data.settings) : DEFAULT_LLM_SETTINGS;
}

export function remoteSettingsStore(idToken: string): SettingsStore {
  return {
    kind: "remote",

    async get() {
      return fetchRemote(idToken);
    },

    async set(patch) {
      const data = await call<{ settings: LlmSettings }>({
        method: "POST",
        idToken,
        // 키는 클라이언트가 보낼 수 있는 값이 아니다. 바꿀 수 있는 것은 이 둘뿐이다.
        body: JSON.stringify({ enabled: patch.enabled, modelId: patch.modelId }),
      });
      // 실패하면 서버의 현재 값을 다시 읽는다. 저장되지 않은 값을 저장된 것처럼 보이면 안 된다.
      if (!data) return fetchRemote(idToken);
      return normalizeSettings(data.settings);
    },
  };
}

/**
 * 서버가 있는 배포인지 확인하고 알맞은 저장소를 고른다.
 *
 * 로그인하지 않았으면 서버에 물어볼 수 없으므로 기기 저장소로 간다.
 * 그래도 분석은 막히지 않는다 — 정밀 분석을 실제로 쓸지는 서버의 /api/analyze 가
 * 자기 설정으로 다시 판단하고, 못 쓰면 규칙 기반으로 돌아가기 때문이다.
 */
export async function resolveSettingsStore(idToken: string | null): Promise<SettingsStore> {
  if (!idToken) return localSettingsStore;
  const probe = await call<{ settings: LlmSettings }>({ method: "GET", idToken });
  return probe ? remoteSettingsStore(idToken) : localSettingsStore;
}
