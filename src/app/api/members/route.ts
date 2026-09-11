/**
 * 회원 관리 API.
 *
 * 여기가 권한을 실제로 강제하는 유일한 곳이다.
 * 요청마다 Google ID 토큰의 서명을 검증하고, 관리자만 목록과 변경을 허용한다.
 * 화면의 검사는 편의일 뿐이므로, 화면을 우회해도 여기서 막힌다.
 *
 * 보관 위치:
 *   ROLEFIT_DATA_DIR 이 있으면 그 아래 members.json — 다시 시작해도 남는다.
 *   없으면 메모리 — 프로세스가 내려가면 사라진다. 개발용이다.
 * 정적 배포(GitHub Pages)에는 이 경로 자체가 없고, 앱은 기기 저장소로 내려간다.
 */
import { NextResponse } from "next/server";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { initialRoleFor, isOwnerEmail } from "@/lib/auth/config";
import { bearerToken, verifyGoogleIdToken, VERIFY_FAILURE_MESSAGE } from "@/lib/auth/verify";
import type { Member, MemberRole, MemberStatus } from "@/lib/auth/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ───────────────────────────── 보관 */

const dataDir = process.env.ROLEFIT_DATA_DIR ?? "";
const filePath = dataDir ? join(dataDir, "members.json") : "";

let memory: Member[] = [];

async function readAll(): Promise<Member[]> {
  if (!filePath) return memory;
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as Member[];
  } catch {
    return [];
  }
}

async function writeAll(members: Member[]): Promise<void> {
  if (!filePath) {
    memory = members;
    return;
  }
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(members, null, 2), "utf8");
}

/* ───────────────────────────── 인증 */

type Caller = { member: Member | null; email: string; sub: string; name: string; picture?: string };

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

  const all = await readAll();
  const existing = all.find((m) => m.id === result.identity.sub) ?? null;
  return {
    ok: true,
    caller: {
      member: existing,
      email: result.identity.email,
      sub: result.identity.sub,
      name: result.identity.name,
      picture: result.identity.picture,
    },
  };
}

/** 호출자가 관리자인가. 저장된 권한이 없으면 설정의 초기 권한으로 판단한다. */
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

  // 저장소가 서버인지 확인하는 용도. 로그인만 되어 있으면 누구나 확인할 수 있다.
  const url = new URL(request.url);
  if (url.searchParams.get("probe") === "1") {
    return NextResponse.json({ ok: true, persistent: Boolean(filePath) });
  }

  if (!isAdminCaller(auth.caller)) {
    return NextResponse.json({ reason: "관리자만 볼 수 있습니다." }, { status: 403 });
  }
  const members = (await readAll()).sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  return NextResponse.json({ members, persistent: Boolean(filePath) });
}

export async function POST(request: Request) {
  const auth = await authenticate(request);
  if (!auth.ok) return NextResponse.json({ reason: auth.reason }, { status: auth.status });

  let body: {
    action?: string;
    member?: Member;
    id?: string;
    role?: MemberRole;
    status?: MemberStatus;
    note?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ reason: "요청을 읽지 못했습니다." }, { status: 400 });
  }

  const all = await readAll();

  // 가입·로그인 기록은 본인만 남길 수 있다. 남의 계정을 만들거나 고칠 수 없다.
  if (body.action === "upsert") {
    const now = new Date().toISOString();
    const existing = all.find((m) => m.id === auth.caller.sub);
    if (!existing) {
      const created: Member = {
        id: auth.caller.sub,
        email: auth.caller.email,
        name: auth.caller.name,
        picture: auth.caller.picture,
        role: initialRoleFor(auth.caller.email),
        status: "active",
        joinedAt: now,
        lastSeenAt: now,
        visits: 1,
      };
      await writeAll([...all, created]);
      return NextResponse.json({ member: created });
    }
    const updated: Member = {
      ...existing,
      email: auth.caller.email,
      name: auth.caller.name,
      picture: auth.caller.picture,
      lastSeenAt: now,
      visits: existing.visits + 1,
      // 권한·상태·메모는 본인이 바꿀 수 없다. 관리자만 바꾼다.
      role: isOwnerEmail(auth.caller.email) ? "owner" : existing.role,
    };
    await writeAll(all.map((m) => (m.id === updated.id ? updated : m)));
    return NextResponse.json({ member: updated });
  }

  if (!isAdminCaller(auth.caller)) {
    return NextResponse.json({ reason: "관리자만 바꿀 수 있습니다." }, { status: 403 });
  }

  const target = all.find((m) => m.id === body.id);
  if (!target) return NextResponse.json({ reason: "회원을 찾지 못했습니다." }, { status: 404 });

  // 소유자 계정은 권한을 내리거나 정지·삭제할 수 없다.
  // 관리자 전원이 서로 권한을 내려 아무도 들어갈 수 없게 되는 상황을 막기 위해서다.
  const targetIsOwner = isOwnerEmail(target.email);
  if (targetIsOwner && body.action !== "note") {
    return NextResponse.json(
      { reason: "소유자 계정의 권한과 이용 상태는 바꿀 수 없습니다." },
      { status: 409 },
    );
  }

  const save = async (next: Member) => {
    await writeAll(all.map((m) => (m.id === next.id ? next : m)));
    return NextResponse.json({ member: next });
  };

  switch (body.action) {
    case "role":
      if (!body.role) return NextResponse.json({ reason: "권한이 없습니다." }, { status: 400 });
      // 소유자 권한은 설정으로만 정해진다. API 로 올릴 수 없다.
      if (body.role === "owner") {
        return NextResponse.json(
          { reason: "소유자 권한은 배포 설정으로만 지정합니다." },
          { status: 403 },
        );
      }
      return save({ ...target, role: body.role });

    case "status":
      if (!body.status) return NextResponse.json({ reason: "상태가 없습니다." }, { status: 400 });
      return save({ ...target, status: body.status });

    case "note":
      return save({ ...target, note: (body.note ?? "").slice(0, 500) });

    case "remove":
      await writeAll(all.filter((m) => m.id !== target.id));
      return NextResponse.json({ ok: true });

    default:
      return NextResponse.json({ reason: "알 수 없는 요청입니다." }, { status: 400 });
  }
}
