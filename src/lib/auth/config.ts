/**
 * 로그인 설정.
 *
 * Google 로그인은 공개 클라이언트 ID 하나만 있으면 된다(비밀키 없음).
 * 그래서 정적 배포에서도 동작하고, 저장소에 비밀이 들어가지 않는다.
 */
import type { MemberRole } from "./types";

/**
 * 서비스 소유자.
 *
 * 이 계정은 항상 owner 이고 권한을 내릴 수 없다.
 * 관리자 전원이 서로 권한을 내려 버려 아무도 들어갈 수 없게 되는 상황을 막기 위해서다.
 */
export const OWNER_EMAILS = ["linkedsugi@gmail.com"] as const;

/**
 * 추가 관리자.
 * 배포 환경에서 ROLEFIT_ADMIN_EMAILS 로 늘릴 수 있다(쉼표 구분).
 * 클라이언트에도 알려야 화면에서 관리 메뉴를 띄울 수 있으므로 NEXT_PUBLIC_ 을 함께 본다.
 */
function extraAdminEmails(): string[] {
  const raw =
    process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? process.env.ROLEFIT_ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * 이 이메일이 처음 로그인할 때 받을 권한.
 *
 * 소유자와 지정 관리자만 미리 정해지고, 나머지는 모두 일반 회원으로 시작한다.
 * 권한은 관리자가 회원 관리 화면에서 올린다.
 */
export function initialRoleFor(email: string): MemberRole {
  const normalized = normalizeEmail(email);
  if ((OWNER_EMAILS as readonly string[]).map(normalizeEmail).includes(normalized)) {
    return "owner";
  }
  if (extraAdminEmails().includes(normalized)) return "admin";
  return "member";
}

export function isOwnerEmail(email: string): boolean {
  return (OWNER_EMAILS as readonly string[]).map(normalizeEmail).includes(normalizeEmail(email));
}

/** 브라우저에서 Google 로그인 버튼을 띄울 때 쓰는 공개 클라이언트 ID. */
export function googleClientId(): string {
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
}

export function isGoogleLoginConfigured(): boolean {
  return googleClientId().length > 0;
}

/** Google ID 토큰을 발급하는 주체. 검증할 때 이 값들만 인정한다. */
export const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
export const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
