/**
 * Google 로그인 (Google Identity Services).
 *
 * 브라우저가 Google 에서 ID 토큰(JWT)을 받아 온다. 비밀키가 필요 없으므로
 * 정적 배포에서도 동작하고, 저장소에 비밀이 들어가지 않는다.
 *
 * **주의**: 여기서 하는 토큰 해석은 화면을 그리기 위한 것이지 보안 경계가 아니다.
 * 브라우저 안에서 하는 검사는 브라우저를 쓰는 사람에게는 언제든 우회된다.
 * 권한을 실제로 강제하려면 서버가 토큰 서명을 검증해야 한다 —
 * 그 일은 /api/auth/verify 와 /api/members 가 한다.
 */
import type { GoogleIdentity } from "./types";

const GSI_SRC = "https://accounts.google.com/gsi/client";

let scriptPromise: Promise<void> | null = null;

/** GIS 스크립트를 한 번만 불러온다. */
export function loadGoogleScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") resolve();
      else {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("google-script-failed")));
      }
      return;
    }
    const script = document.createElement("script");
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    });
    script.addEventListener("error", () => reject(new Error("google-script-failed")));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/** base64url 로 인코딩된 JWT 조각을 문자열로. */
function decodeSegment(segment: string): string {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/");
  const withPadding = padded + "=".repeat((4 - (padded.length % 4)) % 4);
  if (typeof atob === "function") {
    // atob 는 바이트 문자열을 주므로 UTF-8 로 다시 읽어야 한글 이름이 깨지지 않는다.
    const bytes = Uint8Array.from(atob(withPadding), (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  }
  return Buffer.from(withPadding, "base64").toString("utf8");
}

/**
 * ID 토큰에서 우리가 쓰는 값만 읽는다.
 *
 * 서명은 검증하지 않는다 — 브라우저에서의 검증은 의미가 없기 때문이다.
 * 형식이 어긋나거나 필수 값이 없으면 null 을 돌려주고, 화면은 로그인 실패로 처리한다.
 */
export function readIdToken(idToken: string): GoogleIdentity | null {
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(decodeSegment(parts[1])) as Record<string, unknown>;
    const sub = typeof payload.sub === "string" ? payload.sub : "";
    const email = typeof payload.email === "string" ? payload.email : "";
    const exp = typeof payload.exp === "number" ? payload.exp : 0;
    if (!sub || !email || !exp) return null;

    return {
      sub,
      email,
      emailVerified: payload.email_verified === true,
      name: typeof payload.name === "string" && payload.name ? payload.name : email.split("@")[0],
      picture: typeof payload.picture === "string" ? payload.picture : undefined,
      exp,
      aud: typeof payload.aud === "string" ? payload.aud : "",
      iss: typeof payload.iss === "string" ? payload.iss : "",
    };
  } catch {
    return null;
  }
}

/* ─────────────────────────── GIS 타입 (필요한 것만) */

interface CredentialResponse {
  credential?: string;
}

interface GoogleAccountsId {
  initialize(options: {
    client_id: string;
    callback: (response: CredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    use_fedcm_for_prompt?: boolean;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      type?: "standard" | "icon";
      theme?: "outline" | "filled_blue" | "filled_black";
      size?: "small" | "medium" | "large";
      text?: "signin_with" | "signup_with" | "continue_with";
      shape?: "rectangular" | "pill" | "circle" | "square";
      locale?: string;
      width?: number;
    },
  ): void;
  disableAutoSelect(): void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleAccountsId } };
  }
}

export function googleIdApi(): GoogleAccountsId | null {
  if (typeof window === "undefined") return null;
  return window.google?.accounts?.id ?? null;
}

/** 로그아웃할 때 자동 선택을 꺼서, 다음에 계정을 다시 고를 수 있게 한다. */
export function disableAutoSelect(): void {
  try {
    googleIdApi()?.disableAutoSelect();
  } catch {
    // GIS 가 없어도 로그아웃 자체는 되어야 한다.
  }
}
