/**
 * Anthropic Messages API 어댑터.
 *
 * ── 왜 SDK 를 쓰지 않는가 ──────────────────────────────────────
 * 이 앱의 분석은 100% 규칙 기반으로도 끝까지 돌아간다. 정밀 분석은 있으면 좋은
 * 보강일 뿐이라, 그것 하나 때문에 런타임 의존성을 늘리지 않는다. 호출은 요청
 * 하나·응답 하나로 끝나므로 fetch 로 충분하다.
 *
 * ── 왜 절대 throw 하지 않는가 ─────────────────────────────────
 * 정밀 분석이 실패해도 분석은 멈추면 안 된다. 이 어댑터가 예외를 던지면 호출부마다
 * try/catch 를 깜빡할 여지가 생기고, 한 번만 놓쳐도 사용자 화면이 멈춘다.
 * 그래서 모든 실패를 LlmFailure 값으로 바꿔 돌려주고, 호출부는 "실패했다"는
 * 사실만 보고 규칙 기반 결과를 그대로 쓰면 된다.
 *
 * ── 왜 키가 여기서만 쓰이는가 ─────────────────────────────────
 * apiKey 는 헤더에만 넣고, 반환값·에러 문구·로그 어디에도 남기지 않는다.
 * 실패 이유는 LlmFailure 라는 닫힌 집합으로만 밖에 나간다. 서버 응답 본문을
 * 그대로 메시지에 실어 보내면 키가 섞여 나갈 여지가 생기기 때문이다.
 */
import { isAllowedModel } from "./models";

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

/** 45초. 분석 화면이 이보다 오래 멈춰 있으면 기다리는 것보다 규칙 기반 결과가 낫다. */
const TIMEOUT_MS = 45_000;

/**
 * 기본 출력 한도를 넉넉히 둔다.
 * 최신 모델은 생각(thinking) 토큰이 같은 한도를 나눠 쓰므로, 한도가 빠듯하면
 * JSON 이 중간에 잘려 매번 'bad-response' 로 끝난다.
 */
const DEFAULT_MAX_TOKENS = 16_000;

export interface LlmCallOptions {
  modelId: string;
  system: string;
  user: string;
  maxTokens?: number;
  signal?: AbortSignal;
  apiKey: string;
}

export type LlmFailure =
  | "no-key"
  | "bad-model"
  | "rate-limited"
  | "timeout"
  | "bad-response"
  | "network"
  | "refused";

export type LlmResult<T> =
  | { ok: true; data: T; modelId: string }
  | { ok: false; reason: LlmFailure };

/** 화면이 "왜 규칙 기반으로 갔는지" 그대로 보여 줄 수 있도록 실패마다 문구를 둔다. */
export const LLM_FAILURE_MESSAGE: Record<LlmFailure, string> = {
  "no-key": "서버에 API 키가 없어 정밀 분석을 건너뛰고 기기 안에서 분석했습니다.",
  "bad-model":
    "설정된 모델을 쓸 수 없어 기기 안에서 분석했습니다. 관리자에게 모델 설정을 확인해 달라고 알려 주세요.",
  "rate-limited": "정밀 분석 요청이 한도에 걸려 기기 안에서 분석했습니다. 잠시 후 다시 시도해 주세요.",
  timeout: "정밀 분석이 시간 안에 끝나지 않아 기기 안에서 분석했습니다.",
  "bad-response": "정밀 분석 결과를 읽을 수 없어 기기 안에서 분석했습니다.",
  network: "정밀 분석 서버에 닿지 못해 기기 안에서 분석했습니다.",
  refused: "모델이 이 요청에 답하지 않아 기기 안에서 분석했습니다.",
};

/**
 * 응답 문자열에서 JSON 객체 하나만 잘라낸다.
 *
 * "JSON 만 출력하라"고 일러도 모델은 ```json 펜스를 두르거나 앞뒤에 한 줄 설명을
 * 붙이곤 한다. 그때마다 실패로 처리하면 멀쩡한 결과를 버리게 되므로,
 * 첫 '{' 부터 짝이 맞는 '}' 까지만 잘라 쓴다.
 *
 * 문자열 리터럴 안의 중괄호는 세지 않는다. "{" 가 값에 들어 있는 경우
 * (예: resumeSentence 에 코드 조각이 인용된 경우) 깊이 계산이 어긋나기 때문이다.
 */
export function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }

  // 짝이 맞지 않으면 잘린 응답이다. 반쪽짜리를 억지로 고쳐 쓰지 않는다.
  return null;
}

/** 응답 본문에서 text 블록만 모은다. 생각(thinking) 블록은 본문이 아니므로 섞지 않는다. */
function collectText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const content = (payload as { content?: unknown }).content;
  if (!Array.isArray(content)) return null;

  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const { type, text } = block as { type?: unknown; text?: unknown };
    if (type === "text" && typeof text === "string") parts.push(text);
  }
  return parts.length > 0 ? parts.join("\n") : null;
}

function statusToFailure(status: number): LlmFailure {
  // 429 한도 초과, 529 과부하 — 둘 다 "지금은 안 되지만 나중엔 된다"는 같은 뜻이다.
  if (status === 429 || status === 529) return "rate-limited";
  // 401·403 은 키가 없거나 거부된 상태다. 응답 본문을 그대로 밖에 내보내지 않기 위해
  // 서버가 준 설명 대신 'no-key' 로 뭉뚱그린다.
  if (status === 401 || status === 403) return "no-key";
  return "network";
}

/**
 * 모델에게 JSON 하나를 받아 validate 를 통과한 값만 돌려준다.
 *
 * validate 가 null 을 주면 파싱에 성공했어도 'bad-response' 다.
 * 모양이 다른 응답을 그대로 도메인에 흘려보내면, 틀린 내용이 사용자 화면까지
 * 조용히 올라간다. 여기서 막는 편이 낫다.
 */
export async function callJson<T>(
  opts: LlmCallOptions,
  validate: (v: unknown) => T | null,
): Promise<LlmResult<T>> {
  if (!opts.apiKey || opts.apiKey.trim().length === 0) {
    return { ok: false, reason: "no-key" };
  }
  // 목록에 없는 모델은 부르지 않는다. 오타 하나로 매번 실패하느니 즉시 이유를 알린다.
  if (!isAllowedModel(opts.modelId)) {
    return { ok: false, reason: "bad-model" };
  }

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener("abort", abortFromCaller);
  }

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": opts.apiKey,
        "anthropic-version": API_VERSION,
      },
      // temperature 같은 샘플링 값은 보내지 않는다. 최신 모델은 이 값을 받으면 400 을 준다.
      body: JSON.stringify({
        model: opts.modelId,
        max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
        system: opts.system,
        messages: [{ role: "user", content: opts.user }],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      return { ok: false, reason: statusToFailure(res.status) };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(await res.text());
    } catch {
      return { ok: false, reason: "bad-response" };
    }

    // 거절은 200 으로 온다. content 를 읽기 전에 stop_reason 부터 본다.
    if ((payload as { stop_reason?: unknown }).stop_reason === "refusal") {
      return { ok: false, reason: "refused" };
    }

    const text = collectText(payload);
    if (!text) return { ok: false, reason: "bad-response" };

    const sliced = extractJsonObject(text);
    if (!sliced) return { ok: false, reason: "bad-response" };

    let parsed: unknown;
    try {
      parsed = JSON.parse(sliced);
    } catch {
      return { ok: false, reason: "bad-response" };
    }

    const data = validate(parsed);
    if (data === null) return { ok: false, reason: "bad-response" };

    return { ok: true, data, modelId: opts.modelId };
  } catch {
    // 취소는 시간 초과와 같은 뜻으로 다룬다 — 사용자에게는 "끝나지 않았다"가 전부다.
    if (controller.signal.aborted) return { ok: false, reason: "timeout" };
    return { ok: false, reason: "network" };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", abortFromCaller);
  }
}
