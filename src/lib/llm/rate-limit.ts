/**
 * 정밀 분석 호출 제한.
 *
 * ── 왜 있는가 ─────────────────────────────────────────────────
 * /api/analyze 는 로그인을 요구하지 않는다. 로그인 없이도 앱을 끝까지 쓸 수 있어야 하기
 * 때문이다. 그런데 그 경로는 **소유자의 API 키**로 모델을 부른다. 그래서 주소만 알면
 * 누구든 반복 호출로 남의 키를 소진시킬 수 있다.
 * 막는 기준을 신원이 아니라 "얼마나 자주" 로 두면, 로그인 없이 쓸 수 있다는 약속을
 * 깨지 않으면서 키를 지킬 수 있다.
 *
 * ── 왜 메모리인가 ────────────────────────────────────────────
 * 대상 배포는 서버 한 대다. 여기서 막고 싶은 것은 분산된 공격이 아니라
 * "같은 곳에서 계속 두드리는 것" 이고, 그건 프로세스 안의 Map 으로 충분하다.
 * 저장소를 붙이면 의존성과 장애 지점이 하나 더 늘고, 그 장애가 곧 분석 중단이 된다.
 * 서버가 다시 시작되면 기록이 사라지지만 그때는 두드리는 쪽도 처음부터 다시 시작한다.
 *
 * ── 왜 Map 을 반드시 청소하는가 ──────────────────────────────
 * 키가 방문자(IP)다. 청소하지 않으면 방문자 수만큼 항목이 쌓여 메모리가 한없이 자라고,
 * 오래 켜 둔 서버가 조용히 죽는다. 한도를 계산하는 창(1시간)보다 오래된 기록은
 * 판단에 아무 영향을 주지 못하므로 버려도 안전하다.
 *
 * ── 왜 초과를 오류로 다루지 않는가 ───────────────────────────
 * 한도를 넘는 것은 고장이 아니다. 그때 앱은 규칙 기반으로 계속 간다.
 * 그래서 여기서 나가는 것은 "막혔다" 는 사실과 화면이 그대로 읽어 줄 문장뿐이다.
 */

/** 한도를 넘었을 때 화면이 그대로 보여 주는 문장. 오류가 아니라 "지금은 기기 안에서 했다" 는 안내다. */
export const RATE_LIMIT_MESSAGE =
  "요청이 너무 잦습니다. 잠시 뒤 다시 시도해 주세요. 지금은 기기 안에서 분석했습니다.";

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;

/**
 * 신원을 모르는 요청의 한도.
 * 한 번의 분석은 사람이 자료를 고치고 다시 누르는 일이라 분당 3회면 넉넉하다.
 * 사람의 속도보다 조금 빠른 선에서 끊는 것이 목적이다.
 */
export const PER_MINUTE_LIMIT = 3;
export const PER_HOUR_LIMIT = 20;

/**
 * 프로세스 전체의 시간당 상한.
 *
 * 키(IP)는 부르는 쪽이 x-forwarded-for 로 꾸밀 수 있다. 요청마다 다른 값을 넣으면
 * 매번 새 버킷을 받아 키별 한도가 아무것도 막지 못한다.
 * 키는 꾸밀 수 있어도 프로세스는 하나뿐이므로, 여기에 천장을 둔다.
 * 이 값은 "정상적인 하루치보다는 넉넉하고, 키를 태워 없앨 만큼은 아닌" 자리다.
 */
export const GLOBAL_PER_HOUR_LIMIT = 200;

/**
 * 서명이 확인된 사용자의 한도.
 * 누가 썼는지 남고 문제가 생기면 그 계정을 멈출 수 있으므로 더 넉넉히 준다.
 */
export const VERIFIED_PER_MINUTE_LIMIT = 10;
export const VERIFIED_PER_HOUR_LIMIT = 60;

export interface RateLimitPolicy {
  perMinute: number;
  perHour: number;
}

export const ANONYMOUS_POLICY: RateLimitPolicy = {
  perMinute: PER_MINUTE_LIMIT,
  perHour: PER_HOUR_LIMIT,
};

export const VERIFIED_POLICY: RateLimitPolicy = {
  perMinute: VERIFIED_PER_MINUTE_LIMIT,
  perHour: VERIFIED_PER_HOUR_LIMIT,
};

/**
 * 동시에 기억하는 키의 최대 개수.
 * 여기에 닿으면 가장 오래 쓰이지 않은 것부터 버린다. 기록을 잃으면 그 키는 한도가
 * 처음부터 다시 세어지지만, 메모리가 무너지는 것보다는 그편이 낫다.
 */
export const MAX_TRACKED_KEYS = 5_000;

/** 청소 주기. 요청이 올 때만 돌므로 타이머를 두지 않는다 — 타이머는 프로세스를 붙잡는다. */
export const SWEEP_INTERVAL_MS = 5 * MINUTE_MS;

export interface RateLimitDecision {
  allowed: boolean;
  /** 다시 시도해도 되는 시각까지 남은 초. 허용됐으면 0. */
  retryAfterSec: number;
}

interface RateLimitStore {
  /** 키 → 허용된 호출 시각(ms). 오래된 것부터 버리므로 길이는 perHour 를 넘지 않는다. */
  hits: Map<string, number[]>;
  /** 키와 무관한 프로세스 전체의 허용 기록. 키 회전으로 우회할 수 없는 천장이다. */
  global: number[];
  lastSweptAt: number;
}

/**
 * globalThis 에 두는 이유: 개발 중 핫리로드로 모듈이 다시 평가돼도 셈이 0 으로 돌아가면
 * 제한이 사실상 없는 것과 같다. 프로세스가 같은 동안에는 기록도 같아야 한다.
 */
const box = globalThis as typeof globalThis & { __rolefitRateLimit?: RateLimitStore };

function store(): RateLimitStore {
  if (!box.__rolefitRateLimit) {
    box.__rolefitRateLimit = { hits: new Map(), global: [], lastSweptAt: 0 };
  }
  // 예전 모양으로 남아 있던 저장소도 받아 준다(핫리로드 중 모듈이 섞이는 경우).
  if (!Array.isArray(box.__rolefitRateLimit.global)) box.__rolefitRateLimit.global = [];
  return box.__rolefitRateLimit;
}

/** 창(1시간) 밖으로 나간 키를 통째로 버린다. 남은 항목의 시각 배열은 check 가 그때그때 줄인다. */
function sweep(s: RateLimitStore, now: number): void {
  for (const [key, hits] of s.hits) {
    const last = hits[hits.length - 1];
    if (last === undefined || now - last >= HOUR_MS) s.hits.delete(key);
  }
  s.lastSweptAt = now;
}

/** Map 은 넣은 순서를 지킨다. 쓸 때마다 다시 넣으므로 앞쪽이 가장 오래 쓰이지 않은 키다. */
function enforceCap(s: RateLimitStore): void {
  if (s.hits.size <= MAX_TRACKED_KEYS) return;
  for (const key of s.hits.keys()) {
    if (s.hits.size <= MAX_TRACKED_KEYS) break;
    s.hits.delete(key);
  }
}

function secondsUntil(target: number, now: number): number {
  // 0초라고 답하면 곧바로 다시 두드리게 된다. 최소 1초는 기다리게 한다.
  return Math.max(1, Math.ceil((target - now) / 1000));
}

/**
 * 이 키가 지금 한 번 더 부를 수 있는가.
 *
 * 허용될 때만 기록한다. 막힌 요청까지 세면 계속 두드리는 쪽은 창이 끝없이 밀려
 * 영원히 풀리지 않는다. 그건 제한이 아니라 차단이고, 우리가 하려는 일이 아니다.
 */
export function checkRateLimit(
  key: string,
  now: number,
  policy: RateLimitPolicy = ANONYMOUS_POLICY,
): RateLimitDecision {
  const s = store();
  if (now - s.lastSweptAt >= SWEEP_INTERVAL_MS) sweep(s, now);

  /*
   * 키 회전으로도 넘을 수 없는 천장.
   * 키별 한도만 두면 x-forwarded-for 를 매번 바꾸는 것으로 통째로 우회된다.
   * 막힌 요청은 여기서도 세지 않는다 — 세면 두드리는 쪽이 창을 계속 밀어
   * 정상 사용자까지 영영 막힌다.
   */
  s.global = s.global.filter((at) => now - at < HOUR_MS);
  if (s.global.length >= GLOBAL_PER_HOUR_LIMIT) {
    return { allowed: false, retryAfterSec: secondsUntil(s.global[0] + HOUR_MS, now) };
  }

  const previous = s.hits.get(key) ?? [];
  // 1시간 밖의 기록은 어떤 판단에도 쓰이지 않는다. 여기서 잘라야 배열이 자라지 않는다.
  const recent = previous.filter((at) => now - at < HOUR_MS);

  if (recent.length >= policy.perHour) {
    s.hits.set(key, recent);
    return { allowed: false, retryAfterSec: secondsUntil(recent[0] + HOUR_MS, now) };
  }

  const inMinute = recent.filter((at) => now - at < MINUTE_MS);
  if (inMinute.length >= policy.perMinute) {
    s.hits.set(key, recent);
    return { allowed: false, retryAfterSec: secondsUntil(inMinute[0] + MINUTE_MS, now) };
  }

  recent.push(now);
  s.global.push(now);
  // 지웠다 다시 넣어야 이 키가 Map 의 맨 뒤로 간다 — enforceCap 이 그 순서를 읽는다.
  s.hits.delete(key);
  s.hits.set(key, recent);

  if (s.hits.size > MAX_TRACKED_KEYS) {
    sweep(s, now);
    enforceCap(s);
  }

  return { allowed: true, retryAfterSec: 0 };
}

/** 지금 기억하고 있는 키의 수. 청소가 실제로 도는지 테스트와 운영 점검이 확인한다. */
export function trackedKeyCount(): number {
  return store().hits.size;
}

/** 기록을 모두 버린다. 테스트가 서로의 셈을 물려받지 않게 하려고 둔다. */
export function resetRateLimit(): void {
  box.__rolefitRateLimit = { hits: new Map(), global: [], lastSweptAt: 0 };
}
