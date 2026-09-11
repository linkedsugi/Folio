/**
 * Google 로그인 버튼.
 *
 * Google 이 직접 그리는 버튼을 쓴다. 브랜드 표기 규칙을 지켜야 하고,
 * 직접 만든 버튼은 계정 선택 창을 띄울 수 없기 때문이다.
 *
 * 로그인이 설정되지 않은 배포에서는 버튼 대신 이유를 적는다.
 * 버튼만 띄워 놓고 눌러도 아무 일이 없으면 사용자가 자기 탓을 하게 된다.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { googleClientId, isGoogleLoginConfigured } from "@/lib/auth/config";
import { googleIdApi, loadGoogleScript } from "@/lib/auth/google";
import { useAuthStore } from "@/store/auth-store";

export function GoogleSignInButton({
  onDone,
  text = "signin_with",
}: {
  onDone?: (ok: boolean) => void;
  text?: "signin_with" | "signup_with" | "continue_with";
}) {
  const holder = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const signIn = useAuthStore((s) => s.signInWithIdToken);

  const handleCredential = useCallback(
    async (credential: string) => {
      const result = await signIn(credential);
      if (!result.ok) setError(result.reason);
      else setError(null);
      onDone?.(result.ok);
    },
    [signIn, onDone],
  );

  useEffect(() => {
    if (!isGoogleLoginConfigured()) return;
    let cancelled = false;

    loadGoogleScript()
      .then(() => {
        if (cancelled) return;
        const api = googleIdApi();
        if (!api || !holder.current) {
          setError("Google 로그인을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
          return;
        }
        api.initialize({
          client_id: googleClientId(),
          callback: (response) => {
            if (response.credential) void handleCredential(response.credential);
            else setError("로그인이 취소되었습니다.");
          },
          cancel_on_tap_outside: true,
          use_fedcm_for_prompt: true,
        });
        holder.current.replaceChildren();
        api.renderButton(holder.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          shape: "rectangular",
          text,
          locale: "ko",
        });
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setError(
            "Google 로그인 스크립트를 불러오지 못했습니다. 네트워크가 차단되어 있을 수 있습니다.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [handleCredential, text]);

  if (!isGoogleLoginConfigured()) {
    return (
      <div className="rounded-sm border border-rule bg-surface px-3 py-2.5 text-[12px] leading-snug text-ink-muted">
        <p className="font-medium text-ink">이 배포에는 Google 로그인이 설정되어 있지 않습니다.</p>
        <p className="mt-0.5">
          로그인 없이도 샘플 체험과 내 자료 분석은 그대로 쓸 수 있습니다. 자료는 이 기기에만
          저장됩니다.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div ref={holder} className="min-h-[40px]" />
      {!ready && !error ? (
        <p className="text-[12px] text-ink-faint">로그인 버튼을 불러오는 중…</p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-1.5 rounded-sm bg-danger-soft px-2 py-1 text-[12px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
