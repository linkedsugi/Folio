/**
 * 로그인·권한 규칙 회귀 테스트.
 *
 * 여기서 고정하는 것은 "누가 무엇을 할 수 있는가" 다.
 * 화면 문구가 바뀌는 것은 괜찮지만 이 규칙이 바뀌면 사고다.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { initialRoleFor, isOwnerEmail, normalizeEmail } from "../config";
import { readIdToken } from "../google";
import { localMemberStore } from "../member-store";
import { isSessionValid, type Member } from "../types";

/** 서명 없이 payload 만 담은 가짜 토큰. readIdToken 은 서명을 보지 않으므로 이걸로 충분하다. */
function fakeIdToken(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o), "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${b64({ alg: "RS256", kid: "k" })}.${b64(payload)}.c2ln`;
}

describe("소유자 계정", () => {
  it("linkedsugi@gmail.com 은 소유자다", () => {
    expect(isOwnerEmail("linkedsugi@gmail.com")).toBe(true);
    expect(initialRoleFor("linkedsugi@gmail.com")).toBe("owner");
  });

  it("대소문자와 공백이 달라도 같은 계정으로 본다", () => {
    expect(isOwnerEmail("  LinkedSugi@Gmail.com ")).toBe(true);
    expect(normalizeEmail(" A@B.COM ")).toBe("a@b.com");
  });

  it("비슷해 보이는 다른 주소는 소유자가 아니다", () => {
    expect(isOwnerEmail("linkedsugi@gmail.com.evil.com")).toBe(false);
    expect(isOwnerEmail("linkedsugi+admin@gmail.com")).toBe(false);
    expect(isOwnerEmail("xlinkedsugi@gmail.com")).toBe(false);
  });

  it("그 외 계정은 모두 일반 회원으로 시작한다", () => {
    expect(initialRoleFor("someone@example.com")).toBe("member");
  });
});

describe("ID 토큰 읽기", () => {
  it("필요한 값을 뽑는다", () => {
    const token = fakeIdToken({
      sub: "123",
      email: "a@b.com",
      email_verified: true,
      name: "한서준",
      exp: 1893456000,
      aud: "client",
      iss: "https://accounts.google.com",
    });
    const identity = readIdToken(token);
    expect(identity?.sub).toBe("123");
    expect(identity?.email).toBe("a@b.com");
    // 한글 이름이 깨지지 않아야 한다 — base64 를 바이트로 읽고 UTF-8 로 디코드하는지 확인.
    expect(identity?.name).toBe("한서준");
  });

  it("형식이 어긋나면 null 이다", () => {
    expect(readIdToken("not-a-token")).toBeNull();
    expect(readIdToken("a.b")).toBeNull();
    expect(readIdToken(fakeIdToken({ email: "a@b.com" }))).toBeNull(); // sub·exp 없음
  });
});

describe("세션 만료", () => {
  const session = {
    member: {} as Member,
    idToken: "t",
    expiresAt: "2026-01-01T00:00:00.000Z",
  };

  it("만료 전에는 유효하다", () => {
    expect(isSessionValid(session, "2025-12-31T23:59:59.000Z")).toBe(true);
  });
  it("만료 후에는 무효다", () => {
    expect(isSessionValid(session, "2026-01-01T00:00:01.000Z")).toBe(false);
  });
  it("세션이 없으면 무효다", () => {
    expect(isSessionValid(null, "2020-01-01T00:00:00.000Z")).toBe(false);
  });
});

describe("이 기기 회원 저장소", () => {
  const base: Member = {
    id: "u1",
    email: "a@b.com",
    name: "가나",
    role: "member",
    status: "active",
    joinedAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-01-01T00:00:00.000Z",
    visits: 1,
  };

  beforeEach(() => localStorage.clear());

  it("처음 로그인하면 가입으로 기록한다", async () => {
    await localMemberStore.upsert(base);
    const list = await localMemberStore.list();
    expect(list).toHaveLength(1);
    expect(list[0].visits).toBe(1);
  });

  it("다시 로그인해도 가입 시각은 그대로고 방문 수만 는다", async () => {
    await localMemberStore.upsert(base);
    const again = await localMemberStore.upsert({
      ...base,
      lastSeenAt: "2026-02-01T00:00:00.000Z",
      visits: 1,
    });
    expect(again.joinedAt).toBe(base.joinedAt);
    expect(again.lastSeenAt).toBe("2026-02-01T00:00:00.000Z");
    expect(again.visits).toBe(2);
  });

  it("관리자가 올린 권한을 로그인할 때 되돌리지 않는다", async () => {
    await localMemberStore.upsert(base);
    await localMemberStore.setRole("u1", "admin");
    // 로그인 시 initialRoleFor 는 'member' 를 주지만, 저장된 권한이 이긴다.
    const again = await localMemberStore.upsert({ ...base, role: "member" });
    expect(again.role).toBe("admin");
  });

  it("소유자 권한은 로그인할 때 항상 회복된다", async () => {
    await localMemberStore.upsert({ ...base, role: "owner" });
    await localMemberStore.setRole("u1", "member");
    const again = await localMemberStore.upsert({ ...base, role: "owner" });
    expect(again.role).toBe("owner");
  });

  it("정지와 해제, 메모, 삭제가 된다", async () => {
    await localMemberStore.upsert(base);
    expect((await localMemberStore.setStatus("u1", "suspended"))?.status).toBe("suspended");
    expect((await localMemberStore.setNote("u1", "문의 응대함"))?.note).toBe("문의 응대함");
    expect(await localMemberStore.remove("u1")).toBe(true);
    expect(await localMemberStore.list()).toHaveLength(0);
  });

  it("저장 내용이 깨져도 빈 목록으로 버틴다", async () => {
    localStorage.setItem("rolefit-members", "{망가진 json");
    expect(await localMemberStore.list()).toEqual([]);
  });
});
