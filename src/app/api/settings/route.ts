/**
 * 정밀 분석 설정 API.
 *
 * 여기가 "정밀 분석을 켤 수 있는 사람" 을 실제로 가르는 곳이다.
 * 화면의 검사는 브라우저를 쓰는 사람에게 언제든 우회되므로,
 * 설정을 바꾸는 일은 회원 API 와 똑같이 Google ID 토큰 서명을 검증한 뒤 관리자에게만 허용한다.
 *
 * 읽기는 로그인한 사람이면 누구나 할 수 있다. 화면이 "왜 규칙 기반으로 갔는지"를
 * 말하려면 켜짐/꺼짐과 키 유무를 알아야 하기 때문이다.
 * 다만 **키 자체는 절대 내려보내지 않는다.** 나가는 것은 keyConfigured: boolean 하나다.
 * 마지막으로 바꾼 사람(updatedBy)도 관리자에게만 준다. 그건 운영 기록이지
 * 일반 회원이 앱을 쓰는 데 필요한 값이 아니고, 운영자가 누구인지는 그 자체로 표적이 된다.
 *
 * 보관 위치:
 *   ROLEFIT_DATA_DIR 이 있으면 그 아래 settings.json — 다시 시작해도 남는다.
 *   없으면 메모리 — 프로세스가 내려가면 사라진다. 개발용이다.
 * 정적 배포(GitHub Pages)에는 이 경로 자체가 없고, 앱은 기기 저장소로 내려간다.
 */
import { NextResponse } from "next/server";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { initialRoleFor, isOwnerEmail } from "@/lib/auth/config";
import { bearerToken, verifyGoogleIdToken, VERIFY_FAILURE_MESSAGE } from "@/lib/auth/verify";
import type { Member, MemberRole } from "@/lib/auth/types";
import { DEFAULT_MODEL_ID, isAllowedModel } from "@/lib/llm/models";
import { normalizeSettings, type LlmSettings } from "@/lib/llm/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ───────────────────────────── 보관 */

/** 저장하는 것은 관리자가 정한 값뿐이다. 키 유무는 저장하지 않고 매번 환경에서 읽는다. */
interface StoredSettings {
  enabled: boolean;
  modelId: string;
  updatedBy?: string;
  updatedAt?: string;
}

const dataDir = process.env.ROLEFIT_DATA_DIR ?? "";
const filePath = dataDir ? join(dataDir, "settings.json") : "";

/**
 * 보관 폴더가 없을 때 쓰는 메모리.
 *
 * globalThis 에 두는 이유: /api/analyze 도 같은 설정을 읽어야 하는데,
 * 모듈마다 따로 변수를 두면 관리자가 켠 설정을 분석 경로가 못 보고
 * 이유 없이 규칙 기반으로 돌아가는 일이 생긴다. 개발 중 핫리로드에도 값이 살아남는다.
 */
const box = globalThis as typeof globalThis & { __rolefitLlmSettings?: StoredSettings };

async function readStored(): Promise<StoredSettings | null> {
  if (!filePath) return box.__rolefitLlmSettings ?? null;
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as StoredSettings;
  } catch {
    // 파일이 없거나 깨졌으면 "아직 아무도 켜지 않았다" 로 본다. 꺼짐이 안전한 기본값이다.
    return null;
  }
}

async function writeStored(settings: StoredSettings): Promise<void> {
  if (!filePath) {
    box.__rolefitLlmSettings = settings;
    return;
  }
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(settings, null, 2), "utf8");
}

/** 키는 서버에서만 읽는다. 값은 어디에도 내보내지 않고 있는지 없는지만 본다. */
function hasApiKey(): boolean {
  return (process.env.ROLEFIT_ANTHROPIC_API_KEY ?? "").trim().length > 0;
}

/** 저장된 값 + 환경의 키 유무 → 화면이 그대로 쓸 수 있는 설정 */
function toSettings(stored: StoredSettings | null): LlmSettings {
  return normalizeSettings({ ...(stored ?? {}), keyConfigured: hasApiKey() });
}

/**
 * 보는 사람에 따라 내려보낼 것을 고른다.
 *
 * updatedBy 는 관리자의 이메일이다. 일반 회원이 알아야 할 이유가 없고,
 * 운영자가 누구인지는 그 자체로 표적이 되는 정보다.
 * 일반 회원에게 필요한 것은 "정밀 분석을 쓸 수 있는 상태인가" 뿐이므로 그것만 준다.
 */
function forViewer(settings: LlmSettings, isAdmin: boolean): LlmSettings {
  if (isAdmin) return settings;
  return {
    enabled: settings.enabled,
    modelId: settings.modelId,
    keyConfigured: settings.keyConfigured,
  };
}

/* ───────────────────────────── 인증 — 회원 API 와 같은 방식 */

type Caller = { member: Member | null; email: string; sub: string };

async function authenticate(
  request: Request,
): Promise<{ ok: true; caller: Caller } | { ok: false; status: number; reason: string }> {
  const token = bearerToken(request);
  if (!token) return { ok: false, status: 401, reason: "로그인이 필요합니다." };

  const result = await verifyGoogleIdToken(token);
  if (!result.ok) {
    // 설정이 없는 배포는 500 이 아니라 "설정 안 됨" 으로 답한다. 화면이 기기 저장소로 내려갈 수 있게.
    const status = result.reason === "not-configured" ? 501 : 401;
    return { ok: false, status, reason: VERIFY_FAILURE_MESSAGE[result.reason] };
  }

  // 권한은 회원 API 가 쓰는 members.json 에 있다. 여기서는 읽기만 하고 고치지 않는다.
  // 보관 폴더가 없는 배포에서는 그 목록이 회원 API 의 메모리에만 있어 비어 보인다.
  // 그때는 아래 callerRole 이 설정의 초기 권한(소유자·지정 관리자)으로 판단한다.
  const members = await readMembers();
  const existing = members.find((m) => m.id === result.identity.sub) ?? null;
  return {
    ok: true,
    caller: { member: existing, email: result.identity.email, sub: result.identity.sub },
  };
}

async function readMembers(): Promise<Member[]> {
  if (!dataDir) return [];
  try {
    return JSON.parse(await readFile(join(dataDir, "members.json"), "utf8")) as Member[];
  } catch {
    return [];
  }
}

function callerRole(caller: Caller): MemberRole {
  if (isOwnerEmail(caller.email)) return "owner";
  return caller.member?.role ?? initialRoleFor(caller.email);
}

function isAdminCaller(caller: Caller): boolean {
  const role = callerRole(caller);
  return role === "owner" || role === "admin";
}

/* ───────────────────────────── 경로 */

export async function GET(request: Request) {
  const auth = await authenticate(request);
  if (!auth.ok) return NextResponse.json({ reason: auth.reason }, { status: auth.status });

  const canEdit = isAdminCaller(auth.caller);
  return NextResponse.json({
    settings: forViewer(toSettings(await readStored()), canEdit),
    /** 재시작하면 사라지는 배포인지 화면이 알려 줄 수 있게 */
    persistent: Boolean(filePath),
    canEdit,
  });
}

export async function POST(request: Request) {
  const auth = await authenticate(request);
  if (!auth.ok) return NextResponse.json({ reason: auth.reason }, { status: auth.status });

  if (!isAdminCaller(auth.caller)) {
    return NextResponse.json({ reason: "관리자만 바꿀 수 있습니다." }, { status: 403 });
  }

  let body: { enabled?: unknown; modelId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ reason: "요청을 읽지 못했습니다." }, { status: 400 });
  }

  const current = await readStored();
  const next: StoredSettings = {
    enabled: typeof body.enabled === "boolean" ? body.enabled : (current?.enabled ?? false),
    modelId: current?.modelId ?? DEFAULT_MODEL_ID,
    updatedBy: auth.caller.email,
    updatedAt: new Date().toISOString(),
  };

  if (body.modelId !== undefined) {
    // 목록에 없는 모델을 저장하면 분석이 매번 조용히 실패한다. 그 전에 막는다.
    if (typeof body.modelId !== "string" || !isAllowedModel(body.modelId)) {
      return NextResponse.json({ reason: "고를 수 없는 모델입니다." }, { status: 400 });
    }
    next.modelId = body.modelId;
  }

  await writeStored(next);
  return NextResponse.json({ settings: toSettings(next), persistent: Boolean(filePath) });
}
