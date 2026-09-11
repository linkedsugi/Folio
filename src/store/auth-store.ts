/**
 * 로그인 상태.
 *
 * 앱은 로그인 없이도 쓸 수 있다. 로그인은 여러 기기에서 같은 사람으로 이어 쓰고,
 * 운영자가 이용 현황을 보기 위한 것이다.
 * 지원자 자료(공고·이력·분석서)는 로그인해도 서버로 올라가지 않는다.
 */
"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { initialRoleFor, isOwnerEmail } from "@/lib/auth/config";
import { disableAutoSelect, readIdToken } from "@/lib/auth/google";
import { localMemberStore, resolveMemberStore, type MemberStore } from "@/lib/auth/member-store";
import {
  isSessionValid,
  type Member,
  type MemberRole,
  type MemberStatus,
  type Session,
} from "@/lib/auth/types";

export type SignInResult =
  | { ok: true; member: Member }
  | { ok: false; reason: string };

interface AuthState {
  session: Session | null;
  /** 회원 저장소가 서버인지 이 기기인지. 화면이 한계를 알릴 때 쓴다. */
  storeKind: "local" | "remote" | "unknown";
  members: Member[];
  loadingMembers: boolean;

  signInWithIdToken: (idToken: string) => Promise<SignInResult>;
  signOut: () => void;
  refreshMembers: () => Promise<void>;
  setRole: (id: string, role: MemberRole) => Promise<void>;
  setStatus: (id: string, status: MemberStatus) => Promise<void>;
  setNote: (id: string, note: string) => Promise<void>;
  removeMember: (id: string) => Promise<void>;
}

/** 지금 세션에 맞는 저장소. 로그인 전에는 이 기기 저장소만 쓴다. */
async function storeFor(session: Session | null): Promise<MemberStore> {
  if (!session) return localMemberStore;
  return resolveMemberStore(session.idToken);
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      session: null,
      storeKind: "unknown",
      members: [],
      loadingMembers: false,

      async signInWithIdToken(idToken) {
        const identity = readIdToken(idToken);
        if (!identity) {
          return { ok: false, reason: "로그인 정보를 읽지 못했습니다. 다시 시도해 주세요." };
        }
        if (!identity.emailVerified) {
          return {
            ok: false,
            reason: "이메일이 확인되지 않은 Google 계정입니다. 계정 확인 후 다시 시도해 주세요.",
          };
        }

        const now = new Date();
        const candidate: Member = {
          id: identity.sub,
          email: identity.email,
          name: identity.name,
          picture: identity.picture,
          role: initialRoleFor(identity.email),
          status: "active",
          joinedAt: now.toISOString(),
          lastSeenAt: now.toISOString(),
          visits: 1,
        };

        const store = await resolveMemberStore(idToken);
        const member = await store.upsert(candidate);

        // 정지된 회원은 로그인은 되지만 앱을 쓸 수 없다. 이유를 분명히 알린다.
        if (member.status === "suspended") {
          return {
            ok: false,
            reason: "이용이 정지된 계정입니다. 관리자에게 문의해 주세요.",
          };
        }

        const session: Session = {
          member,
          idToken,
          expiresAt: new Date(identity.exp * 1000).toISOString(),
        };
        set({ session, storeKind: store.kind });
        return { ok: true, member };
      },

      signOut() {
        disableAutoSelect();
        set({ session: null, members: [], storeKind: "unknown" });
      },

      async refreshMembers() {
        set({ loadingMembers: true });
        try {
          const store = await storeFor(get().session);
          const members = await store.list();
          set({ members, storeKind: store.kind });
        } finally {
          set({ loadingMembers: false });
        }
      },

      async setRole(id, role) {
        const store = await storeFor(get().session);
        const updated = await store.setRole(id, role);
        if (updated) set({ members: get().members.map((m) => (m.id === id ? updated : m)) });
      },

      async setStatus(id, status) {
        const store = await storeFor(get().session);
        const updated = await store.setStatus(id, status);
        if (updated) set({ members: get().members.map((m) => (m.id === id ? updated : m)) });
      },

      async setNote(id, note) {
        const store = await storeFor(get().session);
        const updated = await store.setNote(id, note);
        if (updated) set({ members: get().members.map((m) => (m.id === id ? updated : m)) });
      },

      async removeMember(id) {
        const store = await storeFor(get().session);
        const ok = await store.remove(id);
        if (ok) set({ members: get().members.filter((m) => m.id !== id) });
      },
    }),
    {
      name: "rolefit-auth",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // 회원 목록은 보관하지 않는다. 화면을 열 때마다 저장소에서 새로 읽는 편이 정확하다.
      partialize: (s) => ({ session: s.session }),
    },
  ),
);

/** 만료된 세션은 없는 것으로 본다. */
export function useSession(): Session | null {
  const session = useAuthStore((s) => s.session);
  const [now, setNow] = useState<string | null>(null);

  useEffect(() => {
    setNow(new Date().toISOString());
    // 토큰은 보통 한 시간이면 만료된다. 화면을 오래 열어 둔 경우를 위해 주기적으로 본다.
    const timer = window.setInterval(() => setNow(new Date().toISOString()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!now) return null; // 서버 렌더 중에는 로그인 상태를 알 수 없다
  return isSessionValid(session, now) ? session : null;
}

export function useIsAdmin(): boolean {
  const session = useSession();
  if (!session) return false;
  return session.member.role === "owner" || session.member.role === "admin";
}

/** 소유자 계정은 권한을 내릴 수 없다. 화면에서 그 버튼 자체를 막는다. */
export function canChangeRole(target: Member): boolean {
  return !isOwnerEmail(target.email);
}

export function useAuthHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (useAuthStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return useAuthStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);
  return hydrated;
}
