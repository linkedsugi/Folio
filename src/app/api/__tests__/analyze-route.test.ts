// @vitest-environment node
/**
 * /api/analyze 회귀 테스트.
 *
 * 여기서 고정하는 것은 문구가 아니라 **선**이다.
 *
 *   1. 동의가 없으면 모델은 한 번도 불리지 않는다.
 *   2. 쓸 수 없는 상황은 오류가 아니라 200 + 이유다. 화면은 규칙 기반으로 계속 간다.
 *   3. 주소만 아는 사람이 남의 키를 소진시킬 수 없다.
 *
 * "모델을 부르지 않았다"는 말은 fetch 호출 수로만 증명된다. 그래서 응답 내용보다
 * fetch 가 몇 번 불렸는지를 먼저 본다. 실제 서버도 실제 API 도 띄우지 않는다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runPipeline } from "@/lib/engine/pipeline";
import { DEFAULT_MODEL_ID } from "@/lib/llm/models";
import {
  HOUR_MS,
  MAX_TRACKED_KEYS,
  MINUTE_MS,
  PER_MINUTE_LIMIT,
  RATE_LIMIT_MESSAGE,
  SWEEP_INTERVAL_MS,
  VERIFIED_PER_MINUTE_LIMIT,
  checkRateLimit,
  resetRateLimit,
  trackedKeyCount,
} from "@/lib/llm/rate-limit";

/**
 * 토큰 검증은 Google 공개키를 받아와야 한다 — 즉 fetch 를 쓴다.
 * 그 fetch 가 섞이면 "모델을 불렀는가" 를 셀 수 없으므로, 검증만 문자열 판정으로 바꾼다.
 */
vi.mock("@/lib/auth/verify", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/verify")>("@/lib/auth/verify");
  return {
    ...actual,
    verifyGoogleIdToken: async (token: string) =>
      token === "good-token"
        ? {
            ok: true,
            identity: {
              sub: "member-1",
              email: "member@example.com",
              emailVerified: true,
              name: "회원",
              exp: 4102444800,
              aud: "client-id",
              iss: "https://accounts.google.com",
            },
          }
        : { ok: false, reason: "bad-signature" },
  };
});

// 보관 폴더가 없으면 설정은 globalThis 메모리에서 읽힌다. 테스트가 그 자리를 직접 쓴다.
delete process.env.ROLEFIT_DATA_DIR;
const { POST } = await import("../analyze/route");

const box = globalThis as typeof globalThis & {
  __rolefitLlmSettings?: { enabled: boolean; modelId: string };
};

/* ─────────────────────────────── 자료는 실제 엔진이 만든 것을 쓴다 */

const jdText = `루멘플레이 스튜디오
Senior Unity Gameplay Engineer

자격 요건
- 상용 게임 개발 경력 5년 이상
- Unity 와 C# 으로 핵심 기능을 구현한 경험
`;

const profileText = `한서준
Unity / C# 개발자
seojun@example.com

경력
픽셀브릿지 | 게임 클라이언트 개발자 | 2025.09 ~ 2026.08
- 상용 게임의 퀘스트 UI 와 데이터 연동 기능을 구현했습니다

학력
한국대학교 | 컴퓨터공학 학사 | 2019.03 ~ 2023.02
`;

const base = runPipeline({ jdText, profileText });

function payload(overrides: Record<string, unknown> = {}) {
  return {
    posting: base.posting,
    profile: base.profile,
    report: base.report,
    consent: true,
    ...overrides,
  };
}

function post(
  body: unknown,
  init: { ip?: string; token?: string; contentLength?: string } = {},
): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-forwarded-for": init.ip ?? "203.0.113.1",
  };
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  if (init.contentLength) headers["content-length"] = init.contentLength;
  return new Request("http://localhost/api/analyze", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** 모델이 부문 설명 한 줄을 다듬어 돌려줬다고 가정한다. */
function stubModelOk() {
  const patch = {
    dimensions: [{ id: base.report.dimensions[0].id, currentBasis: "모델이 다듬은 설명입니다." }],
  };
  const mock = vi.fn(async () => ({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(patch) }] }),
  }));
  vi.stubGlobal("fetch", mock);
  return mock;
}

function stubModelStatus(status: number) {
  const mock = vi.fn(async () => ({
    ok: false,
    status,
    text: async () => JSON.stringify({ error: "nope" }),
  }));
  vi.stubGlobal("fetch", mock);
  return mock;
}

interface AnalyzeResponse {
  ok: boolean;
  reason?: string;
  usedLlm?: boolean;
  retryAfterSec?: number;
  report?: typeof base.report;
}

async function read(res: Response): Promise<AnalyzeResponse> {
  return (await res.json()) as AnalyzeResponse;
}

beforeEach(() => {
  resetRateLimit();
  box.__rolefitLlmSettings = { enabled: true, modelId: DEFAULT_MODEL_ID };
  vi.stubEnv("ROLEFIT_ANTHROPIC_API_KEY", "sk-ant-테스트-키");
  // 기본은 로그인이 없는 배포다. 토큰을 보는 경로는 필요한 테스트에서만 켠다.
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  delete box.__rolefitLlmSettings;
});

/* ─────────────────────────────── 동의 */

describe("동의가 없으면 자료는 나가지 않는다", () => {
  it("consent 가 없으면 403 이고 모델을 부르지 않는다", async () => {
    const fetchMock = stubModelOk();
    const res = await POST(post(payload({ consent: undefined })));

    expect(res.status).toBe(403);
    expect((await read(res)).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('문자열 "true" 는 동의가 아니다 — 실수 한 번이 곧 자료 전송이 되면 안 된다', async () => {
    const fetchMock = stubModelOk();
    const res = await POST(post(payload({ consent: "true" })));

    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("consent: false 면 403 이고 모델을 부르지 않는다", async () => {
    const fetchMock = stubModelOk();
    const res = await POST(post(payload({ consent: false })));

    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/* ─────────────────────────────── 쓸 수 없는 상황 */

describe("쓸 수 없는 것은 실패가 아니다 — 200 에 이유를 담는다", () => {
  it("관리자가 켜지 않았으면 200 + 이유이고 모델을 부르지 않는다", async () => {
    box.__rolefitLlmSettings = { enabled: false, modelId: DEFAULT_MODEL_ID };
    const fetchMock = stubModelOk();

    const res = await POST(post(payload()));
    const data = await read(res);

    expect(res.status).toBe(200);
    expect(data.ok).toBe(false);
    expect(data.reason).toContain("관리자");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("서버에 키가 없으면 200 + 이유이고 모델을 부르지 않는다", async () => {
    vi.stubEnv("ROLEFIT_ANTHROPIC_API_KEY", "");
    const fetchMock = stubModelOk();

    const res = await POST(post(payload()));
    const data = await read(res);

    expect(res.status).toBe(200);
    expect(data.ok).toBe(false);
    expect(data.reason).toContain("키");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("모델 호출이 실패해도 규칙 기반 분석서가 온전히 나오고 이유가 붙는다", async () => {
    const fetchMock = stubModelStatus(500);

    const res = await POST(post(payload()));
    const data = await read(res);

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.usedLlm).toBe(false);
    expect(data.reason && data.reason.length > 0).toBe(true);
    expect(data.report?.overall.display).toEqual(base.report.overall.display);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

/* ─────────────────────────────── 본문 */

describe("본문", () => {
  it("선언된 크기가 1MB 를 넘으면 413 — 메모리에 올리기 전에 끊는다", async () => {
    const fetchMock = stubModelOk();
    const res = await POST(post(payload(), { contentLength: String(1024 * 1024 + 1) }));

    expect(res.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("헤더가 거짓말을 해도 실제 본문이 1MB 를 넘으면 413", async () => {
    const fetchMock = stubModelOk();
    const huge = `{"consent":true,"pad":"${"가".repeat(400_000)}"}`;
    const res = await POST(post(huge, { contentLength: "10" }));

    expect(res.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("JSON 이 깨졌으면 400 이고 모델을 부르지 않는다", async () => {
    const fetchMock = stubModelOk();
    const res = await POST(post("{이건 JSON 이 아니다"));

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("공고·이력·분석서 중 하나라도 없으면 400", async () => {
    const fetchMock = stubModelOk();
    const res = await POST(post(payload({ report: undefined })));

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/* ─────────────────────────────── 호출 제한 */

describe("호출 제한 — 남의 키를 소진시킬 수 없다", () => {
  it("분당 한도를 넘으면 200 + 이유이고 모델을 더 부르지 않는다", async () => {
    const fetchMock = stubModelOk();
    const ip = "198.51.100.7";

    for (let i = 0; i < PER_MINUTE_LIMIT; i += 1) {
      const allowed = await read(await POST(post(payload(), { ip })));
      expect(allowed.ok).toBe(true);
    }
    expect(fetchMock).toHaveBeenCalledTimes(PER_MINUTE_LIMIT);

    const res = await POST(post(payload(), { ip }));
    const data = await read(res);

    // 429 가 아니다 — 화면은 규칙 기반 결과로 이어가야 하고, 429 는 고장으로 읽힌다.
    expect(res.status).toBe(200);
    expect(data.ok).toBe(false);
    expect(data.reason).toBe(RATE_LIMIT_MESSAGE);
    expect(data.retryAfterSec).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(PER_MINUTE_LIMIT);
  });

  it("다른 곳에서 온 요청은 서로의 한도를 깎지 않는다", async () => {
    stubModelOk();
    for (let i = 0; i < PER_MINUTE_LIMIT + 1; i += 1) {
      await POST(post(payload(), { ip: "198.51.100.8" }));
    }

    const other = await read(await POST(post(payload(), { ip: "198.51.100.9" })));
    expect(other.ok).toBe(true);
  });

  it("x-forwarded-for 가 없으면 x-real-ip 로 센다 — 프록시마다 헤더가 다르다", async () => {
    stubModelOk();
    const byRealIp = (ip: string) =>
      new Request("http://localhost/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json", "x-real-ip": ip },
        body: JSON.stringify(payload()),
      });

    for (let i = 0; i < PER_MINUTE_LIMIT; i += 1) await POST(byRealIp("192.0.2.5"));
    const blocked = await read(await POST(byRealIp("192.0.2.5")));
    const other = await read(await POST(byRealIp("192.0.2.6")));

    // 헤더 하나만 보고 없으면 모두 한 덩어리로 묶였다면, 여기서 둘 다 막혔을 것이다.
    expect(blocked.reason).toBe(RATE_LIMIT_MESSAGE);
    expect(other.ok).toBe(true);
  });

  it("서명이 확인된 사용자는 더 넉넉한 한도를 받는다", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "client-id");
    // 모델까지 가지 않아도 한도 판정은 그 앞에서 끝난다. 켜지 않은 상태로 셈만 본다.
    box.__rolefitLlmSettings = { enabled: false, modelId: DEFAULT_MODEL_ID };
    const fetchMock = stubModelOk();

    let last = "";
    for (let i = 0; i < PER_MINUTE_LIMIT + 1; i += 1) {
      const data = await read(
        await POST(post(payload(), { ip: "198.51.100.10", token: "good-token" })),
      );
      last = data.reason ?? "";
    }

    expect(last).not.toBe(RATE_LIMIT_MESSAGE);
    expect(PER_MINUTE_LIMIT).toBeLessThan(VERIFIED_PER_MINUTE_LIMIT);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("토큰이 없거나 만료돼도 막지 않는다 — 익명 한도로 계속 쓸 수 있다", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "client-id");
    stubModelOk();

    const first = await read(
      await POST(post(payload(), { ip: "198.51.100.11", token: "expired-token" })),
    );
    expect(first.ok).toBe(true);

    for (let i = 0; i < PER_MINUTE_LIMIT; i += 1) {
      await POST(post(payload(), { ip: "198.51.100.11", token: "expired-token" }));
    }
    const blocked = await read(
      await POST(post(payload(), { ip: "198.51.100.11", token: "expired-token" })),
    );
    // 검증에 실패한 토큰은 "없는 것" 으로 보고 IP 한도를 쓴다. 오류가 아니다.
    expect(blocked.reason).toBe(RATE_LIMIT_MESSAGE);
  });
});

/* ─────────────────────────────── 성공 */

describe("성공한 보강", () => {
  it("문장만 바뀌고 규칙 엔진이 만든 점수는 그대로다", async () => {
    stubModelOk();

    const data = await read(await POST(post(payload())));

    expect(data.ok).toBe(true);
    expect(data.usedLlm).toBe(true);
    expect(data.report?.dimensions[0].currentBasis).toBe("모델이 다듬은 설명입니다.");
    // 수치는 규칙 엔진의 것이다. 모델이 무엇을 보내오든 여기가 흔들리면 안 된다.
    expect(data.report?.overall.raw).toEqual(base.report.overall.raw);
    expect(data.report?.overall.display).toEqual(base.report.overall.display);
    expect(data.report?.dimensions[0].current).toBe(base.report.dimensions[0].current);
    expect(data.report?.dimensions[0].afterStory).toBe(base.report.dimensions[0].afterStory);
    expect(data.report?.dimensions[0].weight).toBe(base.report.dimensions[0].weight);
  });

  it("응답 어디에도 API 키가 실리지 않는다", async () => {
    stubModelOk();
    vi.stubEnv("ROLEFIT_ANTHROPIC_API_KEY", "sk-ant-절대-나가면-안-되는-값");

    const res = await POST(post(payload()));
    const text = await res.text();

    expect(text).not.toContain("sk-ant-절대-나가면-안-되는-값");
  });
});

/* ─────────────────────────────── 호출 기록 자체 */

describe("호출 기록은 무한히 쌓이지 않는다", () => {
  it("창 밖으로 나간 키는 청소된다 — 방문자 수만큼 메모리가 자라면 안 된다", () => {
    const start = 10 * HOUR_MS;
    for (let i = 0; i < 50; i += 1) checkRateLimit(`ip:${i}`, start);
    expect(trackedKeyCount()).toBe(50);

    // 1시간이 지나면 그 기록들은 어떤 판단에도 쓰이지 않는다. 다음 요청 때 치운다.
    checkRateLimit("ip:새로-온-사람", start + HOUR_MS + SWEEP_INTERVAL_MS);
    expect(trackedKeyCount()).toBe(1);
  });

  it("키가 한꺼번에 몰려도 기억하는 수에 상한이 있다", () => {
    for (let i = 0; i <= MAX_TRACKED_KEYS + 10; i += 1) checkRateLimit(`ip:${i}`, 0);
    expect(trackedKeyCount()).toBeLessThanOrEqual(MAX_TRACKED_KEYS);
  });

  it("막힌 요청은 세지 않는다 — 계속 두드려도 풀릴 시각이 밀리지 않는다", () => {
    const t0 = HOUR_MS;
    for (let i = 0; i < PER_MINUTE_LIMIT; i += 1) {
      expect(checkRateLimit("ip:두드리는-쪽", t0).allowed).toBe(true);
    }

    const blocked = checkRateLimit("ip:두드리는-쪽", t0 + 30_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBe(30);
    for (let i = 0; i < 20; i += 1) {
      expect(checkRateLimit("ip:두드리는-쪽", t0 + 30_000).allowed).toBe(false);
    }

    // 첫 호출로부터 1분이 지나면 다시 열린다. 막힌 요청이 창을 밀었다면 여기서 막혔을 것이다.
    expect(checkRateLimit("ip:두드리는-쪽", t0 + MINUTE_MS + 1).allowed).toBe(true);
  });
});
