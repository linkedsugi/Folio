/**
 * 정밀 분석 설정 저장소 회귀 테스트.
 *
 * 여기서 고정하는 것은 "언제 자료가 밖으로 나가는가" 다.
 * 문구나 화면은 바뀌어도 되지만, 아래 규칙이 바뀌면 사고다.
 *
 *   · 아무것도 설정하지 않은 상태는 꺼짐이다.
 *   · 저장된 값이 깨져도 앱은 꺼짐으로 버틴다.
 *   · 목록에 없는 모델은 저장되지 않는다.
 *   · 기기 저장소의 keyConfigured 는 언제나 false 다 — 서버가 없으니 키도 없다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_MODEL_ID } from "../models";
import { canUseLlm, DEFAULT_LLM_SETTINGS } from "../settings";
import { localSettingsStore, remoteSettingsStore, resolveSettingsStore } from "../settings-store";

const KEY = "rolefit-llm-settings";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("기기 저장소 — 기본값", () => {
  it("아무것도 저장되지 않았으면 꺼진 기본값이다", async () => {
    const settings = await localSettingsStore.get();
    expect(settings).toEqual(DEFAULT_LLM_SETTINGS);
    expect(settings.enabled).toBe(false);
    expect(settings.modelId).toBe(DEFAULT_MODEL_ID);
  });

  it("kind 는 local 이다", () => {
    expect(localSettingsStore.kind).toBe("local");
  });
});

describe("기기 저장소 — 깨진 값 복구", () => {
  it("JSON 이 아니면 기본값으로 버틴다", async () => {
    localStorage.setItem(KEY, "{망가진 값");
    expect(await localSettingsStore.get()).toEqual(DEFAULT_LLM_SETTINGS);
  });

  it("객체가 아닌 값(배열·숫자)이어도 기본값으로 버틴다", async () => {
    localStorage.setItem(KEY, JSON.stringify([1, 2, 3]));
    expect(await localSettingsStore.get()).toEqual(DEFAULT_LLM_SETTINGS);

    localStorage.setItem(KEY, JSON.stringify(42));
    expect(await localSettingsStore.get()).toEqual(DEFAULT_LLM_SETTINGS);
  });

  it("enabled 가 문자열이면 켜진 것으로 보지 않는다", async () => {
    // "true" 같은 문자열을 참으로 읽으면, 켠 적 없는 설정이 켜진 것으로 살아난다.
    localStorage.setItem(KEY, JSON.stringify({ enabled: "true", modelId: DEFAULT_MODEL_ID }));
    expect((await localSettingsStore.get()).enabled).toBe(false);
  });
});

describe("기기 저장소 — 모델 화이트리스트", () => {
  it("목록에 없는 모델이 저장돼 있으면 기본 모델로 읽는다", async () => {
    localStorage.setItem(KEY, JSON.stringify({ enabled: true, modelId: "claude-opus-5.1" }));
    expect((await localSettingsStore.get()).modelId).toBe(DEFAULT_MODEL_ID);
  });

  it("목록에 없는 모델로 바꾸려 하면 기본 모델로 떨어진다", async () => {
    const saved = await localSettingsStore.set({ modelId: "gpt-무엇이든" });
    expect(saved.modelId).toBe(DEFAULT_MODEL_ID);
    expect((await localSettingsStore.get()).modelId).toBe(DEFAULT_MODEL_ID);
  });

  it("목록에 있는 모델은 그대로 저장되고 다시 읽힌다", async () => {
    const saved = await localSettingsStore.set({ enabled: true, modelId: "claude-sonnet-5" });
    expect(saved.modelId).toBe("claude-sonnet-5");
    expect(saved.enabled).toBe(true);

    const read = await localSettingsStore.get();
    expect(read.modelId).toBe("claude-sonnet-5");
    expect(read.enabled).toBe(true);
    expect(read.updatedAt).toBeTruthy();
  });
});

describe("기기 저장소 — 키는 있을 수 없다", () => {
  it("저장된 값이 keyConfigured: true 라고 주장해도 믿지 않는다", async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ enabled: true, modelId: DEFAULT_MODEL_ID, keyConfigured: true }),
    );
    expect((await localSettingsStore.get()).keyConfigured).toBe(false);
  });

  it("keyConfigured 를 켜 달라고 해도 false 로 저장된다", async () => {
    const saved = await localSettingsStore.set({ enabled: true, keyConfigured: true });
    expect(saved.keyConfigured).toBe(false);
    expect((await localSettingsStore.get()).keyConfigured).toBe(false);
  });

  it("그래서 기기 저장소만 있는 배포는 늘 규칙 기반으로 동작한다", async () => {
    // 관리자가 켜고 지원자가 동의해도, 키가 없으므로 모델을 부르지 않는다. 이것이 옳은 동작이다.
    await localSettingsStore.set({ enabled: true });
    const settings = await localSettingsStore.get();
    expect(canUseLlm(settings, true)).toBe(false);
  });
});

describe("저장소 고르기", () => {
  it("로그인하지 않았으면 기기 저장소를 쓴다", async () => {
    const store = await resolveSettingsStore(null);
    expect(store.kind).toBe("local");
  });

  it("응답이 JSON 이 아니면(정적 배포의 404 HTML) 기기 저장소로 내려간다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<!doctype html>", { headers: { "content-type": "text/html" } })),
    );
    const store = await resolveSettingsStore("id-token");
    expect(store.kind).toBe("local");
  });

  it("서버가 설정을 돌려주면 서버 저장소를 쓴다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ settings: { enabled: true, keyConfigured: true } }), {
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    const store = await resolveSettingsStore("id-token");
    expect(store.kind).toBe("remote");
  });
});

describe("서버 저장소", () => {
  it("서버에 닿지 못하면 꺼진 값으로 본다 — 확인 못 한 설정으로 자료를 보내지 않는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const settings = await remoteSettingsStore("id-token").get();
    expect(settings).toEqual(DEFAULT_LLM_SETTINGS);
    expect(canUseLlm(settings, true)).toBe(false);
  });

  it("키 유무는 서버가 알려 준 대로 읽는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              settings: { enabled: true, modelId: "claude-sonnet-5", keyConfigured: true },
            }),
            { headers: { "content-type": "application/json" } },
          ),
      ),
    );
    const settings = await remoteSettingsStore("id-token").get();
    expect(settings.keyConfigured).toBe(true);
    expect(canUseLlm(settings, true)).toBe(true);
    // 동의가 없으면 켜져 있어도 쓰지 않는다.
    expect(canUseLlm(settings, false)).toBe(false);
  });
});
