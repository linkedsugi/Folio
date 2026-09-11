/**
 * 설정 변경이 실패했을 때 무엇이 화면까지 올라가는가.
 *
 * 여기서 고정하는 것은 "실패가 조용하지 않다" 는 규칙이다.
 * 403(관리자 아님)·401(토큰 만료)·500 이 모두 같은 침묵이 되면,
 * 바꾼 사람은 체크박스가 되돌아간 것만 보고 원인을 영영 알 수 없다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { remoteSettingsStore, resolveSettingsStore, localSettingsStore } from "../settings-store";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** POST 는 거절하고, 그 뒤 현재 값을 다시 읽는 GET 은 성공시킨다. */
function rejectWrites(status: number, reason?: string) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    if ((init?.method ?? "GET") === "POST") {
      return jsonResponse(reason ? { reason } : {}, status);
    }
    return jsonResponse({ settings: { enabled: false, keyConfigured: true } });
  });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("서버가 변경을 거절하면", () => {
  it("관리자가 아니면 서버가 준 이유를 그대로 들고 온다", async () => {
    vi.stubGlobal("fetch", rejectWrites(403, "관리자만 바꿀 수 있습니다."));
    const result = await remoteSettingsStore("id-token").set({ enabled: true });

    expect(result.error).toEqual({ status: 403, reason: "관리자만 바꿀 수 있습니다." });
    // 저장되지 않은 값을 저장된 것처럼 보이면 안 된다 — 서버의 현재 값이 그대로 온다.
    expect(result.enabled).toBe(false);
  });

  it("토큰이 만료되면 401 과 다시 로그인하라는 문장이 온다", async () => {
    vi.stubGlobal("fetch", rejectWrites(401));
    const result = await remoteSettingsStore("id-token").set({ enabled: true });

    expect(result.error?.status).toBe(401);
    expect(result.error?.reason).toContain("로그인");
  });

  it("서버 오류(500)도 이유 없이 지나가지 않는다", async () => {
    vi.stubGlobal("fetch", rejectWrites(500));
    const result = await remoteSettingsStore("id-token").set({ enabled: true });

    expect(result.error?.status).toBe(500);
    expect(result.error?.reason.length).toBeGreaterThan(0);
  });

  it("서버에 닿지 못하면 상태 없이(0) 연결 문제라고 말한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const result = await remoteSettingsStore("id-token").set({ enabled: true });

    expect(result.error?.status).toBe(0);
    expect(result.error?.reason).toContain("서버에 닿지 못했습니다");
  });
});

describe("성공하면 실패 사유가 없다", () => {
  it("서버가 받아들이면 error 가 붙지 않는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ settings: { enabled: true, keyConfigured: true } })),
    );
    const result = await remoteSettingsStore("id-token").set({ enabled: true });

    expect(result.error).toBeUndefined();
    expect(result.enabled).toBe(true);
  });

  it("기기 저장소는 실패할 곳이 없으므로 언제나 error 가 없다", async () => {
    const result = await localSettingsStore.set({ enabled: true });
    expect(result.error).toBeUndefined();
  });
});

describe("어느 저장소를 쓸 것인가", () => {
  it("서버가 JSON 으로 거절했다면 서버가 있는 배포다 — 기기 저장소로 숨지 않는다", async () => {
    // 여기서 기기 저장소로 내려가면, 관리자는 브라우저에만 저장해 놓고
    // 서버에 반영된 줄 알게 된다. 그 침묵이 이 규칙이 막으려는 것이다.
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ reason: "로그인이 필요합니다." }, 401)));
    expect((await resolveSettingsStore("id-token")).kind).toBe("remote");
  });

  it("JSON 이 아닌 응답(정적 배포의 404 HTML)이면 기기 저장소로 간다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("<!doctype html>", { status: 404, headers: { "content-type": "text/html" } }),
      ),
    );
    expect((await resolveSettingsStore("id-token")).kind).toBe("local");
  });
});
