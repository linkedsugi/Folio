/**
 * 서버에서 Google ID 토큰을 검증한다.
 *
 * 이것이 이 앱의 유일한 진짜 권한 경계다.
 * 브라우저 안에서 하는 검사는 브라우저를 쓰는 사람에게 언제든 우회되므로,
 * 회원 목록을 읽고 권한을 바꾸는 일은 반드시 여기를 지나야 한다.
 *
 * 검증 항목:
 *   서명   — Google 의 공개키(JWKS)로 확인
 *   iss    — accounts.google.com
 *   aud    — 우리 클라이언트 ID
 *   exp    — 만료 전
 *   email_verified — 확인된 이메일만
 *
 * 외부 라이브러리 없이 WebCrypto 로 한다. 의존성을 늘리지 않기 위해서다.
 */
import { GOOGLE_ISSUERS, GOOGLE_JWKS_URL, googleClientId } from "./config";
import type { GoogleIdentity } from "./types";

interface Jwk {
  kid: string;
  n: string;
  e: string;
  alg?: string;
  kty: string;
}

/** Google 의 공개키는 자주 바뀌지 않는다. 매 요청마다 받아오면 느려진다. */
let jwksCache: { keys: Jwk[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000;

async function getKeys(nowMs: number): Promise<Jwk[]> {
  if (jwksCache && nowMs - jwksCache.fetchedAt < JWKS_TTL_MS) return jwksCache.keys;
  const res = await fetch(GOOGLE_JWKS_URL);
  if (!res.ok) throw new Error("jwks-unavailable");
  const data = (await res.json()) as { keys?: Jwk[] };
  const keys = data.keys ?? [];
  jwksCache = { keys, fetchedAt: nowMs };
  return keys;
}

function base64UrlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const withPadding = padded + "=".repeat((4 - (padded.length % 4)) % 4);
  const binary = atob(withPadding);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function decodeJson(segment: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment))) as Record<string, unknown>;
}

export type VerifyFailure =
  | "not-configured"
  | "malformed"
  | "unknown-key"
  | "bad-signature"
  | "bad-issuer"
  | "bad-audience"
  | "expired"
  | "email-unverified";

export type VerifyResult =
  | { ok: true; identity: GoogleIdentity }
  | { ok: false; reason: VerifyFailure };

export async function verifyGoogleIdToken(
  idToken: string,
  nowMs: number = Date.now(),
): Promise<VerifyResult> {
  const clientId = googleClientId();
  // 클라이언트 ID 를 모르면 aud 를 확인할 수 없다. 확인 못 하는 토큰은 통과시키지 않는다.
  if (!clientId) return { ok: false, reason: "not-configured" };

  const parts = idToken.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };

  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = decodeJson(parts[0]);
    payload = decodeJson(parts[1]);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const kid = typeof header.kid === "string" ? header.kid : "";
  const keys = await getKeys(nowMs);
  const jwk = keys.find((k) => k.kid === kid);
  if (!jwk) return { ok: false, reason: "unknown-key" };

  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlToBytes(parts[2]) as unknown as ArrayBuffer,
    signed as unknown as ArrayBuffer,
  );
  if (!valid) return { ok: false, reason: "bad-signature" };

  const iss = typeof payload.iss === "string" ? payload.iss : "";
  if (!GOOGLE_ISSUERS.includes(iss)) return { ok: false, reason: "bad-issuer" };

  const aud = typeof payload.aud === "string" ? payload.aud : "";
  if (aud !== clientId) return { ok: false, reason: "bad-audience" };

  const exp = typeof payload.exp === "number" ? payload.exp : 0;
  if (exp * 1000 <= nowMs) return { ok: false, reason: "expired" };

  if (payload.email_verified !== true) return { ok: false, reason: "email-unverified" };

  const email = typeof payload.email === "string" ? payload.email : "";
  const sub = typeof payload.sub === "string" ? payload.sub : "";
  if (!email || !sub) return { ok: false, reason: "malformed" };

  return {
    ok: true,
    identity: {
      sub,
      email,
      emailVerified: true,
      name: typeof payload.name === "string" && payload.name ? payload.name : email.split("@")[0],
      picture: typeof payload.picture === "string" ? payload.picture : undefined,
      exp,
      aud,
      iss,
    },
  };
}

export const VERIFY_FAILURE_MESSAGE: Record<VerifyFailure, string> = {
  "not-configured": "이 배포에는 Google 로그인이 설정되어 있지 않습니다.",
  malformed: "로그인 정보를 읽지 못했습니다.",
  "unknown-key": "로그인 정보를 확인하지 못했습니다. 다시 로그인해 주세요.",
  "bad-signature": "로그인 정보가 올바르지 않습니다.",
  "bad-issuer": "로그인 정보가 올바르지 않습니다.",
  "bad-audience": "다른 서비스의 로그인 정보입니다.",
  expired: "로그인이 만료되었습니다. 다시 로그인해 주세요.",
  "email-unverified": "이메일이 확인되지 않은 계정입니다.",
};

/** 요청 헤더에서 Bearer 토큰을 꺼낸다. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : null;
}
