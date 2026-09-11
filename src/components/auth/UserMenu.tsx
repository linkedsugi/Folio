/**
 * 머리글의 계정 영역.
 *
 * 로그인은 선택이다. 로그인하지 않아도 앱은 그대로 쓸 수 있으므로,
 * 로그인을 강요하는 모양(막는 벽)을 만들지 않는다.
 */
"use client";

import { useState } from "react";
import Link from "next/link";
import { ROLE_LABEL, isAdmin } from "@/lib/auth/types";
import { isGoogleLoginConfigured } from "@/lib/auth/config";
import { useAuthHydrated, useAuthStore, useSession } from "@/store/auth-store";
import { GoogleSignInButton } from "./GoogleSignInButton";

export function UserMenu() {
  const hydrated = useAuthHydrated();
  const session = useSession();
  const signOut = useAuthStore((s) => s.signOut);
  const [open, setOpen] = useState(false);

  // 서버 렌더와 어긋나지 않도록, 복원 전에는 자리만 잡아 둔다.
  if (!hydrated) return <span className="h-7 w-16" aria-hidden />;

  if (!session) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="rounded-sm border border-rule-strong bg-canvas px-2.5 py-1 text-[12px] font-medium text-ink hover:border-ink"
        >
          로그인 · 가입
        </button>
        {open ? (
          <div className="absolute right-0 z-30 mt-1.5 w-72 rounded-sm border border-rule-strong bg-canvas p-3 shadow-lg">
            <p className="text-[12px] font-bold text-ink">Google 계정으로 시작</p>
            <p className="mt-0.5 mb-2.5 text-[11px] leading-snug text-ink-muted">
              로그인하지 않아도 모든 기능을 쓸 수 있습니다. 로그인하면 같은 계정으로 이어서
              준비할 수 있습니다. 공고·이력·분석서는 로그인해도 서버로 올라가지 않습니다.
            </p>
            <GoogleSignInButton text="continue_with" onDone={(ok) => ok && setOpen(false)} />
          </div>
        ) : null}
      </div>
    );
  }

  const { member } = session;
  return (
    <div className="relative flex items-center gap-2">
      {isAdmin(member.role) ? (
        <Link
          href="/admin"
          className="rounded-sm px-2 py-1 text-[12px] font-medium text-brand hover:bg-brand-soft"
        >
          회원 관리
        </Link>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-sm px-1.5 py-1 hover:bg-surface-sunken"
      >
        {member.picture ? (
          // Google 프로필 이미지는 외부 주소라 next/image 로 최적화하지 않는다.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={member.picture} alt="" className="size-6 rounded-full" referrerPolicy="no-referrer" />
        ) : (
          <span className="grid size-6 place-items-center rounded-full bg-brand-soft text-[11px] font-bold text-brand">
            {member.name.slice(0, 1)}
          </span>
        )}
        <span className="hidden text-[12px] font-medium text-ink sm:inline">{member.name}</span>
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-30 mt-1.5 w-64 rounded-sm border border-rule-strong bg-canvas p-3 shadow-lg">
          <p className="text-[12px] font-bold text-ink">{member.name}</p>
          <p className="truncate text-[11px] text-ink-muted">{member.email}</p>
          <p className="mt-1 inline-block rounded-sm bg-surface-sunken px-1.5 py-0.5 text-[11px] font-medium text-ink-muted">
            {ROLE_LABEL[member.role]}
          </p>
          <button
            type="button"
            onClick={() => {
              signOut();
              setOpen(false);
            }}
            className="mt-2.5 w-full rounded-sm border border-rule-strong px-2 py-1 text-[12px] font-medium text-ink hover:border-ink"
          >
            로그아웃
          </button>
          {!isGoogleLoginConfigured() ? (
            <p className="mt-2 text-[10px] leading-snug text-ink-faint">
              이 배포에는 로그인 설정이 없어 이 세션은 이 기기에만 남습니다.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
