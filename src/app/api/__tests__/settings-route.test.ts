// @vitest-environment node
/**
 * /api/settings 회귀 테스트.
 *
 * 여기서 고정하는 것은 "누가 무엇을 할 수 있고, 무엇이 내려가는가" 다.
 *
 *   1. 설정을 바꾸는 일은 서명이 확인된 관리자만 한다. 화면의 검사는 믿지 않는다.
 *   2. 목록에 없는 모델은 저장되지 않는다 — 저장되면 분석이 매번 조용히 실패한다.
 *   3. 키는 물론이고 **관리자의 이메일도** 일반 회원에게 내려가지 않는다.
 *
 * 실제 서버는 띄우지 않고 route 함수를 직접 부른다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_MODEL_ID } from "@/lib/llm/models";

/**
 * 토큰 검증은 Google 공개키(JWKS)를 받아와야 한다. 테스트가 네트워크에 기대면
 * 결국 아무도 돌리지 않는 테스트가 되므로, 서명 검증만 문자열 판정으로 바꾼다.
 * 바뀌는 것은 "이 토큰이 진짜인가" 뿐이고, 권한 판단은 실제 코드가 그대로 한다.
 */
vi.mock("@/lib/auth/verify", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/verify")>("@/lib/auth/verify");
  const identities: Record<string, { sub: string; email: string }> = {
    // 소유자 계정. src/lib/auth/config.ts 가 항상 owner 로 본다.
    "owner-token": { sub: "owner-1", email: "linkedsugi@gmail.com" },
    "member-token": { sub: "member-1", email: "someone@example.com" },
  };
  return {
    ...actual,
    verifyGoogleIdToken: async (token: string) => {
      const found = identities[token];
      if (!found) return { ok: false, reason: "bad-signature" };
      return {
        ok: true,
        identity: {
          sub: found.sub,
          email: found.email,
          emailVerified: true,
          name: found.email.split("@")[0],
          exp: 4102444800,
          aud: "client-id",
          iss: "https://accounts.google.com",
        },
      };
    },
  };
});

// 보관 폴더가 없는 배포로 돌린다. 저장은 globalThis 메모리에 남고 테스트가 그것을 읽는다.
delete process.env.ROLEFIT_DATA_DIR;
const { GET, POST } = await import("../settings/route");

interface StoredSettings {
  enabled: boolean;
  modelId: string;
  updatedBy?: string;
  updatedAt?: string;
}

const box = globalThis as typeof globalThis & { __rolefitLlmSettings?: StoredSettings };

interface SettingsResponse {
  settings?: {
    enabled?: boolean;
    modelId?: string;
    keyConfigured?: boolean;
    updatedBy?: string;
    updatedAt?: string;
  };
  canEdit?: boolean;
  persistent?: boolean;
  reason?: string;
}

function get(token?: string): Request {
  return new Request("http://localhost/api/settings", {
    method: "GET",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

function post(body: unknown, token?: string): Request {
  return new Request("http://localhost/api/settings", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function read(res: Response): Promise<SettingsResponse> {
  return (await res.json()) as SettingsResponse;
}

beforeEach(() => {
  box.__rolefitLlmSettings = {
    enabled: true,
    modelId: DEFAULT_MODEL_ID,
    updatedBy: "linkedsugi@gmail.com",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
  vi.stubEnv("ROLEFIT_ANTHROPIC_API_KEY", "sk-ant-절대-나가면-안-되는-값");
  // 지정 관리자 목록이 환경에 남아 있으면 일반 회원이 관리자가 되어 테스트가 거짓이 된다.
  vi.stubEnv("NEXT_PUBLIC_ADMIN_EMAILS", "");
  vi.stubEnv("ROLEFIT_ADMIN_EMAILS", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete box.__rolefitLlmSettings;
});

/* ─────────────────────────────── 읽기 */

describe("GET — 읽을 수 있는 사람과 내려가는 값", () => {
  it("토큰이 없으면 401", async () => {
    const res = await GET(get());
    expect(res.status).toBe(401);
  });

  it("서명이 확인되지 않는 토큰이면 401", async () => {
    const res = await GET(get("forged-token"));
    expect(res.status).toBe(401);
  });

  it("일반 회원에게는 관리자 이메일(updatedBy)과 시각을 주지 않는다", async () => {
    const res = await GET(get("member-token"));
    const data = await read(res);

    expect(res.status).toBe(200);
    expect(data.canEdit).toBe(false);
    // 앱을 쓰는 데 필요한 것은 여기까지다.
    expect(data.settings?.enabled).toBe(true);
    expect(data.settings?.keyConfigured).toBe(true);
    expect(data.settings?.updatedBy).toBeUndefined();
    expect(data.settings?.updatedAt).toBeUndefined();
  });

  it("관리자에게는 운영 기록을 준다", async () => {
    const data = await read(await GET(get("owner-token")));

    expect(data.canEdit).toBe(true);
    expect(data.settings?.updatedBy).toBe("linkedsugi@gmail.com");
    expect(data.settings?.updatedAt).toBe("2026-09-01T00:00:00.000Z");
  });

  it("키 값은 누구에게도 내려가지 않는다 — 나가는 것은 keyConfigured 뿐이다", async () => {
    const asAdmin = await (await GET(get("owner-token"))).text();
    const asMember = await (await GET(get("member-token"))).text();

    expect(asAdmin).not.toContain("sk-ant-절대-나가면-안-되는-값");
    expect(asMember).not.toContain("sk-ant-절대-나가면-안-되는-값");
    expect(asMember).toContain("keyConfigured");
  });
});

/* ─────────────────────────────── 쓰기 */

describe("POST — 바꿀 수 있는 사람", () => {
  it("토큰이 없으면 401 이고 값은 그대로다", async () => {
    const res = await POST(post({ enabled: false }));

    expect(res.status).toBe(401);
    expect(box.__rolefitLlmSettings?.enabled).toBe(true);
  });

  it("일반 회원의 토큰이면 403 이고 값은 그대로다", async () => {
    const res = await POST(post({ enabled: false }, "member-token"));

    expect(res.status).toBe(403);
    expect((await read(res)).reason).toContain("관리자");
    expect(box.__rolefitLlmSettings?.enabled).toBe(true);
  });

  it("목록에 없는 모델은 400 이고 저장되지 않는다", async () => {
    const res = await POST(post({ modelId: "claude-opus-5.1" }, "owner-token"));

    expect(res.status).toBe(400);
    expect(box.__rolefitLlmSettings?.modelId).toBe(DEFAULT_MODEL_ID);
  });

  it("모델 자리에 문자열이 아닌 값이 와도 400", async () => {
    const res = await POST(post({ modelId: { id: "claude-opus-5" } }, "owner-token"));

    expect(res.status).toBe(400);
    expect(box.__rolefitLlmSettings?.modelId).toBe(DEFAULT_MODEL_ID);
  });

  it("관리자는 바꿀 수 있고 누가 바꿨는지 남는다", async () => {
    const res = await POST(post({ enabled: false, modelId: "claude-sonnet-5" }, "owner-token"));
    const data = await read(res);

    expect(res.status).toBe(200);
    expect(data.settings?.enabled).toBe(false);
    expect(data.settings?.modelId).toBe("claude-sonnet-5");
    expect(box.__rolefitLlmSettings?.updatedBy).toBe("linkedsugi@gmail.com");
  });

  it("본문이 깨졌으면 400", async () => {
    const res = await POST(post("{이건 JSON 이 아니다", "owner-token"));

    expect(res.status).toBe(400);
    expect(box.__rolefitLlmSettings?.enabled).toBe(true);
  });
});
