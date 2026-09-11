/**
 * 정밀 분석 API.
 *
 * ── 이 경로가 지키는 선 ───────────────────────────────────────
 * 이 앱에서 지원자 자료가 기기를 떠나는 곳은 여기 하나뿐이다. 그래서 네 가지를 지킨다.
 *
 *   1. **동의 없이는 아무것도 보내지 않는다.** consent !== true 면 본문을 더 보지 않고 403 이다.
 *      설정을 읽는 것도, 키를 찾는 것도 그다음이다.
 *   2. **canUseLlm 을 반드시 거친다.** 관리자가 켰는가·키가 있는가·동의했는가.
 *      하나라도 빠지면 모델을 부르지 않는다.
 *   3. **못 쓰는 것은 실패가 아니다.** 규칙 기반으로 가는 것은 정상 흐름이므로
 *      200 에 { ok: false, reason } 을 담아 돌려준다. 화면은 그 reason 을 그대로 보여 주면 된다.
 *      500 으로 답하면 화면이 "분석이 고장났다"고 오해하게 된다.
 *   4. **호출 제한을 둔다.** 이 경로는 소유자의 키로 모델을 부르므로, 로그인을 요구하지
 *      않는 만큼 호출 빈도로 막는다. 이것이 없으면 주소를 아는 누구나 남의 키를 쓸 수 있다.
 *
 * 로그인은 요구하지 않는다. 이 앱은 로그인 없이도 끝까지 쓸 수 있어야 한다.
 * 대신 동의는 반드시 본다 — 신원보다 동의가 이 경로의 조건이기 때문이다.
 * 로그인한 사람은 막지 않고 **한도를 넉넉히 주는 쪽**으로만 대접한다.
 *
 * 키는 process.env 에서만 읽고 응답·로그 어디에도 남기지 않는다.
 */
import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isGoogleLoginConfigured } from "@/lib/auth/config";
import { bearerToken, verifyGoogleIdToken } from "@/lib/auth/verify";
import { enrichReport } from "@/lib/llm/analyze";
import { LLM_FAILURE_MESSAGE } from "@/lib/llm/client";
import {
  ANONYMOUS_POLICY,
  RATE_LIMIT_MESSAGE,
  VERIFIED_POLICY,
  checkRateLimit,
  type RateLimitPolicy,
} from "@/lib/llm/rate-limit";
import { canUseLlm, llmUnavailableReason, normalizeSettings } from "@/lib/llm/settings";
import type { LlmSettings } from "@/lib/llm/settings";
import type { ApplicantProfile, JobPosting, StrategyReport } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 본문 상한 1MB.
 * 공고와 이력을 다 담아도 이 크기를 넘지 않는다. 넘는 요청은 붙여넣기 사고이거나
 * 서버 메모리를 노린 것이므로, 파싱하기 전에 끊는다.
 */
const MAX_BODY_BYTES = 1024 * 1024;

/* ───────────────────────────── 설정 읽기 */

/**
 * /api/settings 와 같은 곳을 읽는다.
 *
 * 같은 파일과 같은 메모리를 보되 route 끼리 import 하지는 않는다.
 * route 파일은 정해진 export 만 가질 수 있고, 정적 빌드에서는 통째로 치워지기 때문이다.
 * (scripts/prepare-static.mjs — 그 배포에는 이 경로 자체가 없다.)
 */
interface StoredSettings {
  enabled?: boolean;
  modelId?: string;
  updatedBy?: string;
  updatedAt?: string;
}

const dataDir = process.env.ROLEFIT_DATA_DIR ?? "";
const filePath = dataDir ? join(dataDir, "settings.json") : "";

const box = globalThis as typeof globalThis & { __rolefitLlmSettings?: StoredSettings };

async function readSettings(): Promise<LlmSettings> {
  let stored: StoredSettings | null = null;
  if (filePath) {
    try {
      stored = JSON.parse(await readFile(filePath, "utf8")) as StoredSettings;
    } catch {
      // 아직 아무도 켜지 않았거나 파일이 깨졌다. 꺼짐이 안전한 기본값이다.
      stored = null;
    }
  } else {
    stored = box.__rolefitLlmSettings ?? null;
  }
  return normalizeSettings({ ...(stored ?? {}), keyConfigured: hasApiKey() });
}

/** 키는 서버에서만 읽는다. 값이 아니라 있는지 없는지만 밖으로 나간다. */
function apiKey(): string {
  return (process.env.ROLEFIT_ANTHROPIC_API_KEY ?? "").trim();
}

function hasApiKey(): boolean {
  return apiKey().length > 0;
}

/* ───────────────────────────── 누구의 호출로 셀 것인가 */

/**
 * 요청을 보낸 곳.
 *
 * x-forwarded-for 는 보내는 쪽이 꾸밀 수 있는 값이다. 그래도 이것을 쓰는 이유는,
 * 여기서 하려는 일이 신원 확인이 아니라 "같은 곳에서 계속 두드리는 것" 을 늦추는 일이기
 * 때문이다.
 *
 * x-real-ip 도 함께 보는 이유: 프록시마다 쓰는 헤더가 다르다. 하나만 보고 없으면
 * 전부 'unknown' 으로 묶어 버리면, 한 사람이 한도를 다 써서 다른 사람들이 막힌다.
 * 그래도 아무것도 모르면 'unknown' 하나로 모아 센다 — 모르는 요청끼리 한도를 나눠 쓰는 편이
 * 저마다 새 한도를 받는 것보다 안전하다.
 */
function clientIp(request: Request): string {
  const forwarded = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "";
  const real = (request.headers.get("x-real-ip") ?? "").trim();
  return forwarded || real || "unknown";
}

/**
 * 이번 호출을 무엇으로 셀 것인가.
 *
 * 토큰이 없다고 막지 않는다. 막으면 "로그인 없이도 쓸 수 있다" 가 무너진다.
 * 서명이 확인된 사람에게만 넉넉한 한도를 주고, 나머지는 IP 로 센다.
 * 검증 실패(만료·위조)도 막는 이유가 되지 않는다 — 그냥 익명으로 본다.
 * 그래야 세션 하나가 만료됐다고 분석 전체가 멈추는 일이 없다.
 */
async function rateLimitSubject(
  request: Request,
): Promise<{ key: string; policy: RateLimitPolicy }> {
  const anonymous = { key: `ip:${clientIp(request)}`, policy: ANONYMOUS_POLICY };
  if (!isGoogleLoginConfigured()) return anonymous;

  const token = bearerToken(request);
  if (!token) return anonymous;

  try {
    const verified = await verifyGoogleIdToken(token);
    if (!verified.ok) return anonymous;
    return { key: `member:${verified.identity.sub}`, policy: VERIFIED_POLICY };
  } catch {
    // Google 공개키를 못 받아오는 등 검증 자체가 불가능한 상황. 익명 한도로 계속 간다.
    return anonymous;
  }
}

/* ───────────────────────────── 경로 */

interface AnalyzeBody {
  posting?: JobPosting;
  profile?: ApplicantProfile;
  report?: StrategyReport;
  consent?: unknown;
}

export async function POST(request: Request) {
  // 본문을 읽기 전에 선언된 크기부터 본다. 큰 요청을 메모리에 올리지 않기 위해서다.
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, reason: "보낸 자료가 너무 큽니다." }, { status: 413 });
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return NextResponse.json({ ok: false, reason: "요청을 읽지 못했습니다." }, { status: 400 });
  }
  // content-length 를 믿지 않고 실제 길이도 확인한다. 헤더는 보내는 쪽이 정한다.
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, reason: "보낸 자료가 너무 큽니다." }, { status: 413 });
  }

  let body: AnalyzeBody;
  try {
    body = JSON.parse(raw) as AnalyzeBody;
  } catch {
    return NextResponse.json({ ok: false, reason: "요청을 읽지 못했습니다." }, { status: 400 });
  }

  // 동의가 가장 먼저다. true 하나만 동의로 본다 — "1"·"yes" 같은 값을 동의로 읽으면
  // 실수 한 번이 곧 자료 전송이 된다.
  if (body.consent !== true) {
    return NextResponse.json({ ok: false, reason: "동의가 없습니다." }, { status: 403 });
  }

  const { posting, profile, report } = body;
  if (!posting || !profile || !report) {
    return NextResponse.json(
      { ok: false, reason: "공고·이력·분석서가 모두 있어야 합니다." },
      { status: 400 },
    );
  }

  /*
   * 여기서 한도를 본다. 동의와 모양이 맞는 요청만 세는 이유는, 키를 쓸 수 있는 요청이
   * 정확히 그것들이기 때문이다. 앞서 403·400 으로 끊긴 요청은 모델을 부르지 못하므로
   * 한도를 깎게 두면 애먼 사람이 대신 막힌다.
   */
  const subject = await rateLimitSubject(request);
  const limit = checkRateLimit(subject.key, Date.now(), subject.policy);
  if (!limit.allowed) {
    // 429 가 아니라 200 이다. 화면은 규칙 기반 결과로 계속 가야 하고,
    // 429 는 사용자에게 "분석이 실패했다"로 읽혀 멀쩡한 결과를 의심하게 만든다.
    return NextResponse.json({
      ok: false,
      reason: RATE_LIMIT_MESSAGE,
      retryAfterSec: limit.retryAfterSec,
    });
  }

  // 동의 여부를 상수로 넘기지 않는다. 위의 가드를 누가 옮기거나 지워도
  // 이 조건이 호출 지점에 남아 있어야 canUseLlm 이 실제로 무언가를 막는다.
  const consented = body.consent === true;
  const settings = await readSettings();
  if (!canUseLlm(settings, consented)) {
    // 실패가 아니라 "규칙 기반으로 간다" 는 정상 흐름이다. 이유는 화면이 그대로 보여 준다.
    return NextResponse.json({
      ok: false,
      reason: llmUnavailableReason(settings, consented) ?? "정밀 분석을 쓸 수 없습니다.",
    });
  }

  try {
    const outcome = await enrichReport({
      posting,
      profile,
      report,
      modelId: settings.modelId,
      apiKey: apiKey(),
    });
    return NextResponse.json({
      ok: true,
      report: outcome.report,
      usedLlm: outcome.usedLlm,
      modelId: settings.modelId,
      // 어느 문장이 다듬어졌는지 화면이 짚어 줄 수 있게 그대로 넘긴다.
      changedPaths: outcome.changedPaths,
      // 보강에 실패했어도 분석서는 온전하다. 왜 규칙 기반인지만 함께 알린다.
      reason: outcome.failure ? LLM_FAILURE_MESSAGE[outcome.failure] : undefined,
    });
  } catch {
    // enrichReport 는 던지지 않기로 되어 있지만, 그 약속이 깨져도 분석은 멈추면 안 된다.
    return NextResponse.json({
      ok: false,
      reason: "정밀 분석 중 문제가 생겨 기기 안에서 분석한 결과를 씁니다.",
    });
  }
}
