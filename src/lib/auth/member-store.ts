/**
 * 회원 저장소.
 *
 * 두 가지 구현을 둔다.
 *
 *  local  — 이 브라우저에만 저장한다. 서버 없는 배포(GitHub Pages)에서 쓴다.
 *           **회원 목록이 기기마다 따로다.** 운영자가 전체 가입자를 보는 용도로는 쓸 수 없다.
 *           이 한계를 화면에서도 숨기지 않고 그대로 알린다.
 *  remote — /api/members 를 쓴다. 서버가 있는 배포에서만 동작하며,
 *           서버가 Google ID 토큰 서명을 검증하고 관리자 권한을 강제한다.
 *
 * 앱은 remote 를 먼저 시도하고, 없으면 local 로 내려간다.
 */
import type { Member, MemberRole, MemberStatus } from "./types";

export interface MemberStore {
  readonly kind: "local" | "remote";
  list(): Promise<Member[]>;
  /** 로그인할 때 부르는 등록/갱신. 처음이면 가입으로 기록한다. */
  upsert(member: Member): Promise<Member>;
  setRole(id: string, role: MemberRole): Promise<Member | null>;
  setStatus(id: string, status: MemberStatus): Promise<Member | null>;
  setNote(id: string, note: string): Promise<Member | null>;
  remove(id: string): Promise<boolean>;
}

const KEY = "rolefit-members";

function readLocal(): Member[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Member[]) : [];
  } catch {
    // 저장 내용이 깨졌다고 로그인 자체가 막히면 안 된다.
    return [];
  }
}

function writeLocal(members: Member[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(members));
  } catch {
    // 저장 공간이 가득 차도 화면은 계속 돌아가야 한다.
  }
}

function patchLocal(id: string, patch: Partial<Member>): Member | null {
  const members = readLocal();
  const index = members.findIndex((m) => m.id === id);
  if (index < 0) return null;
  const next = { ...members[index], ...patch };
  members[index] = next;
  writeLocal(members);
  return next;
}

export const localMemberStore: MemberStore = {
  kind: "local",

  async list() {
    return readLocal().sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  },

  async upsert(member) {
    const members = readLocal();
    const existing = members.find((m) => m.id === member.id);
    if (!existing) {
      members.push(member);
      writeLocal(members);
      return member;
    }
    // 가입 시각과 관리자가 정한 권한·상태·메모는 로그인할 때마다 덮어쓰지 않는다.
    const merged: Member = {
      ...existing,
      email: member.email,
      name: member.name,
      picture: member.picture,
      lastSeenAt: member.lastSeenAt,
      visits: existing.visits + 1,
      // 소유자 권한만은 설정이 항상 이긴다. 실수로 잠기는 일을 막기 위해서다.
      role: member.role === "owner" ? "owner" : existing.role,
    };
    writeLocal(members.map((m) => (m.id === member.id ? merged : m)));
    return merged;
  },

  async setRole(id, role) {
    return patchLocal(id, { role });
  },
  async setStatus(id, status) {
    return patchLocal(id, { status });
  },
  async setNote(id, note) {
    return patchLocal(id, { note });
  },
  async remove(id) {
    const members = readLocal();
    const next = members.filter((m) => m.id !== id);
    if (next.length === members.length) return false;
    writeLocal(next);
    return true;
  },
};

/* ─────────────────────────────── 서버 저장소 */

async function call<T>(
  path: string,
  init: RequestInit & { idToken: string },
): Promise<T | null> {
  const { idToken, ...rest } = init;
  try {
    const res = await fetch(path, {
      ...rest,
      headers: {
        ...(rest.headers ?? {}),
        "content-type": "application/json",
        authorization: `Bearer ${idToken}`,
      },
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    // 정적 배포에서는 404 HTML 이 돌아온다. 그것을 결과로 착각하지 않는다.
    if (!type.includes("application/json")) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function remoteMemberStore(idToken: string): MemberStore {
  return {
    kind: "remote",
    async list() {
      const data = await call<{ members: Member[] }>("/api/members", {
        method: "GET",
        idToken,
      });
      return data?.members ?? [];
    },
    async upsert(member) {
      const data = await call<{ member: Member }>("/api/members", {
        method: "POST",
        idToken,
        body: JSON.stringify({ action: "upsert", member }),
      });
      return data?.member ?? member;
    },
    async setRole(id, role) {
      const data = await call<{ member: Member }>("/api/members", {
        method: "POST",
        idToken,
        body: JSON.stringify({ action: "role", id, role }),
      });
      return data?.member ?? null;
    },
    async setStatus(id, status) {
      const data = await call<{ member: Member }>("/api/members", {
        method: "POST",
        idToken,
        body: JSON.stringify({ action: "status", id, status }),
      });
      return data?.member ?? null;
    },
    async setNote(id, note) {
      const data = await call<{ member: Member }>("/api/members", {
        method: "POST",
        idToken,
        body: JSON.stringify({ action: "note", id, note }),
      });
      return data?.member ?? null;
    },
    async remove(id) {
      const data = await call<{ ok: boolean }>("/api/members", {
        method: "POST",
        idToken,
        body: JSON.stringify({ action: "remove", id }),
      });
      return data?.ok === true;
    },
  };
}

/**
 * 서버가 있는 배포인지 확인하고 알맞은 저장소를 고른다.
 *
 * 확인에 실패하면 local 로 내려간다 — 로그인은 되는데 화면이 비는 것보다,
 * 기기 안에서라도 동작하는 편이 낫다.
 */
export async function resolveMemberStore(idToken: string): Promise<MemberStore> {
  const remote = remoteMemberStore(idToken);
  const probe = await call<{ ok: boolean }>("/api/members?probe=1", {
    method: "GET",
    idToken,
  });
  return probe ? remote : localMemberStore;
}
