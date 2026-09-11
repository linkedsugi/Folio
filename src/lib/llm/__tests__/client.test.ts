/**
 * Anthropic 어댑터 검증.
 *
 * 실제 API 는 부르지 않는다. 테스트가 네트워크에 기대면 키가 필요해지고,
 * 키가 필요한 테스트는 결국 아무도 돌리지 않는다.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { LLM_FAILURE_MESSAGE, callJson, extractJsonObject, type LlmFailure } from "../client";
import { DEFAULT_MODEL_ID } from "../models";

const KEY = "sk-ant-test-도둑맞으면-안-되는-값";

/** 모델이 본문 text 블록으로 이 문자열을 돌려줬다고 가정한다. */
function modelSays(text: string, stopReason = "end_turn") {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: DEFAULT_MODEL_ID,
    stop_reason: stopReason,
    content: [{ type: "text", text }],
  };
}

function stub(payload: unknown, status = 200) {
  const fetchMock = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function call(overrides: Partial<Parameters<typeof callJson>[0]> = {}) {
  return callJson<{ ok: string }>(
    { modelId: DEFAULT_MODEL_ID, system: "s", user: "u", apiKey: KEY, ...overrides },
    (v) => {
      const value = v as { ok?: unknown };
      return typeof value.ok === "string" ? { ok: value.ok } : null;
    },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("extractJsonObject — 모델은 JSON 만 주지 않는다", () => {
  it("```json 펜스를 걷어낸다", () => {
    const raw = '```json\n{"ok":"yes"}\n```';
    expect(extractJsonObject(raw)).toBe('{"ok":"yes"}');
  });

  it("앞뒤에 붙은 설명을 걷어낸다", () => {
    const raw = '분석했습니다.\n{"ok":"yes"}\n도움이 되었길 바랍니다.';
    expect(extractJsonObject(raw)).toBe('{"ok":"yes"}');
  });

  it("문자열 안의 중괄호를 깊이로 세지 않는다", () => {
    const raw = '{"ok":"닫는 괄호 } 가 값에 있다","nested":{"a":1}}';
    expect(extractJsonObject(raw)).toBe(raw);
    expect(JSON.parse(extractJsonObject(raw) as string)).toHaveProperty("nested.a", 1);
  });

  it("이스케이프된 따옴표에 속지 않는다", () => {
    const raw = '{"ok":"그는 \\"} 끝\\" 이라고 했다"}';
    expect(extractJsonObject(raw)).toBe(raw);
  });

  it("짝이 맞지 않으면 null — 잘린 응답을 억지로 고쳐 쓰지 않는다", () => {
    expect(extractJsonObject('{"ok":"yes"')).toBeNull();
    expect(extractJsonObject("설명만 있고 JSON 이 없다")).toBeNull();
  });
});

describe("callJson — 성공", () => {
  it("펜스로 감싼 응답을 읽는다", async () => {
    stub(modelSays('```json\n{"ok":"yes"}\n```'));
    const res = await call();
    expect(res).toEqual({ ok: true, data: { ok: "yes" }, modelId: DEFAULT_MODEL_ID });
  });

  it("앞뒤 설명이 붙은 응답을 읽는다", async () => {
    stub(modelSays('말씀하신 대로 정리했습니다.\n{"ok":"yes"}\n필요하면 더 고쳐 드릴게요.'));
    const res = await call();
    expect(res.ok).toBe(true);
  });

  it("생각 블록이 섞여 와도 본문 text 만 읽는다", async () => {
    stub({
      stop_reason: "end_turn",
      content: [
        { type: "thinking", thinking: "" },
        { type: "text", text: '{"ok":"yes"}' },
      ],
    });
    const res = await call();
    expect(res.ok).toBe(true);
  });

  it("엔드포인트와 헤더를 규격대로 보낸다", async () => {
    const fetchMock = stub(modelSays('{"ok":"yes"}'));
    await call({ maxTokens: 1234 });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe(KEY);
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers.Authorization).toBeUndefined();

    const body = JSON.parse(init.body as string);
    expect(body.model).toBe(DEFAULT_MODEL_ID);
    expect(body.max_tokens).toBe(1234);
    expect(body.messages).toEqual([{ role: "user", content: "u" }]);
    // 최신 모델은 샘플링 값을 받으면 400 을 준다. 보내지 않는다.
    expect(body.temperature).toBeUndefined();
  });
});

describe("callJson — 실패는 값으로 돌아온다", () => {
  it("깨진 JSON 은 'bad-response'", async () => {
    stub(modelSays('{"ok":"yes" 여기서 끊김'));
    expect(await call()).toEqual({ ok: false, reason: "bad-response" });
  });

  it("파싱은 되어도 validate 가 거르면 'bad-response'", async () => {
    stub(modelSays('{"다른":"모양"}'));
    expect(await call()).toEqual({ ok: false, reason: "bad-response" });
  });

  it("본문에 text 블록이 없으면 'bad-response'", async () => {
    stub({ stop_reason: "end_turn", content: [] });
    expect(await call()).toEqual({ ok: false, reason: "bad-response" });
  });

  it("429 는 'rate-limited'", async () => {
    stub({ error: "rate limit" }, 429);
    expect(await call()).toEqual({ ok: false, reason: "rate-limited" });
  });

  it("529(과부하)도 'rate-limited'", async () => {
    stub({ error: "overloaded" }, 529);
    expect(await call()).toEqual({ ok: false, reason: "rate-limited" });
  });

  it("네트워크 예외는 'network' — 던지지 않는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    expect(await call()).toEqual({ ok: false, reason: "network" });
  });

  it("모델이 거절하면 'refused'", async () => {
    stub(modelSays('{"ok":"yes"}', "refusal"));
    expect(await call()).toEqual({ ok: false, reason: "refused" });
  });

  it("호출이 취소되면 'timeout'", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn(async () => {
      throw new DOMException("aborted", "AbortError");
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await call({ signal: controller.signal })).toEqual({ ok: false, reason: "timeout" });
  });

  it("목록에 없는 모델이면 부르지도 않는다", async () => {
    const fetchMock = stub(modelSays('{"ok":"yes"}'));
    expect(await call({ modelId: "claude-opus-5.1" })).toEqual({ ok: false, reason: "bad-model" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("키가 비어 있으면 부르지도 않는다", async () => {
    const fetchMock = stub(modelSays('{"ok":"yes"}'));
    expect(await call({ apiKey: "   " })).toEqual({ ok: false, reason: "no-key" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("401 은 'bad-key' — 여기 닿았다는 건 키가 있었다는 뜻이다", async () => {
    stub({ error: { message: `invalid x-api-key ${KEY}` } }, 401);
    const res = await call();
    expect(res).toEqual({ ok: false, reason: "bad-key" });

    // 이유는 바뀌어도 응답 본문은 그대로 밖에 나가지 않는다.
    const serialized = JSON.stringify(res) + LLM_FAILURE_MESSAGE["bad-key"];
    expect(serialized).not.toContain(KEY);
    expect(serialized).not.toContain("invalid x-api-key");
  });

  it("403 도 'bad-key'", async () => {
    stub({ error: { message: "permission denied" } }, 403);
    expect(await call()).toEqual({ ok: false, reason: "bad-key" });
  });

  it("400 은 'bad-request' — 서버에 닿았는데 요청이 거절된 것이다", async () => {
    stub({ error: { message: "temperature: unexpected field" } }, 400);
    expect(await call()).toEqual({ ok: false, reason: "bad-request" });
  });

  it("404 도 'bad-request'", async () => {
    stub({ error: { message: "not found" } }, 404);
    expect(await call()).toEqual({ ok: false, reason: "bad-request" });
  });

  it("413(본문이 너무 큼)도 'bad-request'", async () => {
    stub({ error: { message: "request too large" } }, 413);
    expect(await call()).toEqual({ ok: false, reason: "bad-request" });
  });

  it("500 은 'network' — 서버 쪽이 무너진 것은 다시 걸어 볼 만하다", async () => {
    stub({ error: { message: "internal server error" } }, 500);
    expect(await call()).toEqual({ ok: false, reason: "network" });
  });

  it("'bad-request' 문구는 네트워크가 아니라 설정을 보게 만든다", () => {
    expect(LLM_FAILURE_MESSAGE["bad-request"]).not.toContain("닿지 못해");
    expect(LLM_FAILURE_MESSAGE["bad-key"]).not.toContain("API 키가 없어");
  });
});

describe("키는 밖으로 나가지 않는다", () => {
  it("성공해도 실패해도 반환값에 키가 없다", async () => {
    stub(modelSays('{"ok":"yes"}'));
    const success = await call();
    expect(JSON.stringify(success)).not.toContain(KEY);

    stub({ error: { message: `bad key ${KEY}` } }, 401);
    const failure = await call();
    expect(JSON.stringify(failure)).not.toContain(KEY);

    stub(modelSays("망가진 응답 " + KEY));
    const badResponse = await call();
    expect(JSON.stringify(badResponse)).not.toContain(KEY);
  });

  it("사용자에게 보일 문구에도 키가 섞일 자리가 없다", () => {
    const failures: LlmFailure[] = [
      "no-key",
      "bad-key",
      "bad-model",
      "rate-limited",
      "timeout",
      "bad-response",
      "bad-request",
      "network",
      "refused",
    ];
    // 실패 이유가 새로 생겼는데 이 목록만 그대로면, 새 문구는 아무도 확인하지 않고 화면에 나간다.
    expect(new Set(failures)).toEqual(new Set(Object.keys(LLM_FAILURE_MESSAGE)));

    for (const failure of failures) {
      const message = LLM_FAILURE_MESSAGE[failure];
      expect(message.length).toBeGreaterThan(0);
      expect(message).not.toContain(KEY);
      // 실패해도 분석은 계속됐다는 사실을 문구가 말해야 한다.
      expect(message).toMatch(/분석했습니다|알려 주세요/);
    }
  });
});
