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

/**
 * 설정을 바꾸지 못한 이유.
 *
 * 실패를 null 하나로 뭉개면 403(관리자 아님)·401(토큰 만료)·500 이 모두 같은 침묵이 되고,
 * 체크박스만 슬그머니 제자리로 돌아간다. 그러면 바꾼 사람은 자기가 무엇을 잘못했는지,
 * 아니면 앱이 고장난 것인지 알 방법이 없다. 그래서 실패도 값으로 돌려준다.
 */
export interface SettingsFailure {
  /** HTTP 상태. 우리 API 가 아예 답하지 않았으면(정적 배포의 404 HTML·네트워크 끊김) 0. */
  status: number;
  /** 화면에 그대로 띄울 문장. 서버가 이유를 줬으면 그것을 쓴다. */
  reason: string;
}

/**
 * set 의 결과.
 *
 * 저장된 설정을 그대로 돌려주되 실패했을 때만 error 를 함께 싣는다.
 * 실패를 따로 던지지 않는 이유: 설정 화면은 실패해도 계속 그려져야 하고,
 * 부르는 쪽이 try/catch 를 한 번 빠뜨리면 그 화면이 통째로 멈추기 때문이다.
 */
export type SettingsWriteResult = LlmSettings & { error?: SettingsFailure };

export interface SettingsStore {
  readonly kind: "local" | "remote";
  get(): Promise<LlmSettings>;
  /** 관리자만 부를 수 있다. 서버 배포에서는 서버가 다시 한 번 권한을 확인한다. */
  set(patch: Partial<LlmSettings>): Promise<SettingsWriteResult>;
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

/** 서버가 이유를 주지 않았을 때 쓰는 문장. 상태 번호만 보여 주면 아무 말도 안 한 것과 같다. */
function defaultReason(status: number): string {
  if (status === 401) return "로그인이 만료되었습니다. 다시 로그인한 뒤 시도해 주세요.";
  if (status === 403) return "관리자만 설정을 바꿀 수 있습니다.";
  if (status === 400) return "서버가 이 설정을 받지 않았습니다.";
  if (status >= 500) return "서버에서 문제가 생겨 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  return "설정을 저장하지 못했습니다.";
}

const NO_SERVER_REASON =
  "설정 서버가 응답하지 않았습니다. 이 배포에는 서버가 없을 수 있습니다.";
const NETWORK_REASON = "서버에 닿지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.";

type CallResult<T> = { ok: true; data: T } | { ok: false; failure: SettingsFailure };

/**
 * /api/settings 한 번 부르기.
 *
 * 실패를 null 로 뭉개지 않는다. 상태와 서버가 준 이유를 그대로 올려보내야
 * 설정 화면이 "관리자가 아니라서" 와 "토큰이 만료돼서" 를 구분해 말할 수 있다.
 */
async function call<T>(init: RequestInit & { idToken: string }): Promise<CallResult<T>> {
  const { idToken, ...rest } = init;

  let res: Response;
  try {
    res = await fetch("/api/settings", {
      ...rest,
      headers: {
        ...(rest.headers ?? {}),
        "content-type": "application/json",
        authorization: `Bearer ${idToken}`,
      },
    });
  } catch {
    return { ok: false, failure: { status: 0, reason: NETWORK_REASON } };
  }

  const isJson = (res.headers.get("content-type") ?? "").includes("application/json");

  if (!res.ok) {
    // JSON 이 아닌 오류는 우리 API 가 아니다(정적 배포의 404 HTML). 상태를 0 으로 두어
    // 부르는 쪽이 "서버가 없다" 와 "서버가 거절했다" 를 구분할 수 있게 한다.
    if (!isJson) return { ok: false, failure: { status: 0, reason: NO_SERVER_REASON } };
    let reason = "";
    try {
      const body = (await res.json()) as { reason?: unknown };
      if (typeof body?.reason === "string" && body.reason.trim()) reason = body.reason;
    } catch {
      // 이유를 못 읽어도 상태는 남는다. 아래 기본 문장으로 대신한다.
    }
    return { ok: false, failure: { status: res.status, reason: reason || defaultReason(res.status) } };
  }

  // 정적 배포에서는 200 자리에 HTML 이 돌아오기도 한다. 그것을 설정으로 착각하지 않는다.
  if (!isJson) return { ok: false, failure: { status: 0, reason: NO_SERVER_REASON } };

  try {
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, failure: { status: res.status, reason: "설정을 읽지 못했습니다." } };
  }
}

async function fetchRemote(idToken: string): Promise<LlmSettings> {
  const result = await call<{ settings: LlmSettings }>({ method: "GET", idToken });
  // 서버에 닿지 못하면 꺼진 상태로 본다. 확인하지 못한 설정으로 자료를 보내지 않는다.
  return result.ok ? normalizeSettings(result.data.settings) : DEFAULT_LLM_SETTINGS;
}

export function remoteSettingsStore(idToken: string): SettingsStore {
  return {
    kind: "remote",

    async get() {
      return fetchRemote(idToken);
    },

    async set(patch) {
      const result = await call<{ settings: LlmSettings }>({
        method: "POST",
        idToken,
        // 키는 클라이언트가 보낼 수 있는 값이 아니다. 바꿀 수 있는 것은 이 둘뿐이다.
        body: JSON.stringify({ enabled: patch.enabled, modelId: patch.modelId }),
      });
      if (result.ok) return normalizeSettings(result.data.settings);
      // 실패하면 서버의 현재 값을 다시 읽는다. 저장되지 않은 값을 저장된 것처럼 보이면 안 된다.
      // 되돌아간 값만 보여 주면 "왜" 가 사라지므로 이유를 함께 싣는다.
      return { ...(await fetchRemote(idToken)), error: result.failure };
    },
  };
}

/**
 * 서버가 있는 배포인지 확인하고 알맞은 저장소를 고른다.
 *
 * 로그인하지 않았으면 서버에 물어볼 수 없으므로 기기 저장소로 간다.
 * 그래도 분석은 막히지 않는다 — 정밀 분석을 실제로 쓸지는 서버의 /api/analyze 가
 * 자기 설정으로 다시 판단하고, 못 쓰면 규칙 기반으로 돌아가기 때문이다.
 *
 * 서버가 JSON 으로 거절(401·403·500)했다면 그 배포에는 설정 서버가 **있다.**
 * 그때 기기 저장소로 내려가면 관리자가 브라우저에만 저장하고 서버에 반영된 줄 알게 되므로,
 * 서버 저장소를 그대로 쓰고 이유를 화면에 보이게 한다.
 */
export async function resolveSettingsStore(idToken: string | null): Promise<SettingsStore> {
  if (!idToken) return localSettingsStore;
  const probe = await call<{ settings: LlmSettings }>({ method: "GET", idToken });
  const serverAnswered = probe.ok || probe.failure.status > 0;
  return serverAnswered ? remoteSettingsStore(idToken) : localSettingsStore;
}
