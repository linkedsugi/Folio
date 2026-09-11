/**
 * 회원과 세션.
 *
 * 이 앱은 로그인 없이도 쓸 수 있다(샘플 체험, 내 자료 분석).
 * 로그인은 여러 기기에서 같은 사람으로 이어 쓰고, 운영자가 이용 현황을 보기 위한 것이다.
 * 지원자 자료 자체는 여전히 기기 안에 있고 서버로 올라가지 않는다.
 */

export type MemberRole = "owner" | "admin" | "member";

export const ROLE_LABEL: Record<MemberRole, string> = {
  owner: "소유자",
  admin: "관리자",
  member: "회원",
};

export const ROLE_NOTE: Record<MemberRole, string> = {
  owner: "서비스 소유자입니다. 권한을 내릴 수 없습니다.",
  admin: "회원 목록을 보고 권한과 이용 상태를 바꿀 수 있습니다.",
  member: "본인의 지원 준비 기능만 사용합니다.",
};

/** 이용 상태. 정지된 회원은 로그인해도 앱을 쓸 수 없다. */
export type MemberStatus = "active" | "suspended";

export const STATUS_LABEL: Record<MemberStatus, string> = {
  active: "이용 중",
  suspended: "정지",
};

export interface Member {
  /** Google 계정의 고유 식별자(sub). 이메일은 바뀔 수 있으므로 이것을 키로 쓴다. */
  id: string;
  email: string;
  name: string;
  picture?: string;
  role: MemberRole;
  status: MemberStatus;
  /** 가입(첫 로그인) 시각 — ISO */
  joinedAt: string;
  /** 마지막 로그인 시각 — ISO */
  lastSeenAt: string;
  /** 로그인 횟수 */
  visits: number;
  /** 관리자가 남기는 메모. 운영 기록이지 평가가 아니다. */
  note?: string;
}

/** Google ID 토큰에서 우리가 쓰는 값만. */
export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture?: string;
  /** 토큰 만료 시각 (초 단위 epoch) */
  exp: number;
  aud: string;
  iss: string;
}

export interface Session {
  member: Member;
  /** 원본 ID 토큰. 서버가 있는 배포에서 요청을 인증할 때 보낸다. */
  idToken: string;
  /** 토큰 만료 시각 — ISO */
  expiresAt: string;
}

export function isAdmin(role: MemberRole): boolean {
  return role === "owner" || role === "admin";
}

/** 세션이 아직 쓸 수 있는가. 만료된 토큰으로 화면을 열어 두지 않는다. */
export function isSessionValid(session: Session | null, nowIso: string): boolean {
  if (!session) return false;
  return session.expiresAt > nowIso;
}
