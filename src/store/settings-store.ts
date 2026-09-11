/**
 * 정밀 분석 설정 상태.
 *
 * 이 앱의 분석은 규칙 기반이 본체이고, 정밀 분석은 선택 사항이다.
 * 그래서 이 저장소는 "켜져 있는가" 가 아니라 **"꺼진 상태에서 시작한다"** 를 기본으로 둔다.
 * 설정을 읽지 못했거나 읽는 중이면 꺼진 것으로 본다 —
 * 확인하지 못한 설정으로 지원자 자료를 밖으로 보내는 일이 있어서는 안 된다.
 *
 * 실제 저장은 src/lib/llm/settings-store.ts 가 맡는다(서버 또는 이 기기).
 * 여기서는 화면이 쓰기 좋은 모양으로 감싸고, 누가 언제 바꿨는지만 덧붙인다.
 */
"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEFAULT_LLM_SETTINGS, normalizeSettings, type LlmSettings } from "@/lib/llm/settings";
import { resolveSettingsStore } from "@/lib/llm/settings-store";
import { isSessionValid } from "@/lib/auth/types";
import { useAuthStore } from "./auth-store";

interface SettingsState {
  settings: LlmSettings;
  loading: boolean;
  /**
   * 설정이 서버에 있는지 이 기기에만 있는지.
   * 관리 화면이 "이 배포에서는 정밀 분석을 쓸 수 없다" 를 구분해 알리기 위해 읽는다.
   */
  storeKind: "local" | "remote" | "unknown";

  load: () => Promise<void>;
  /** 관리자만 부른다. 서버 배포에서는 서버가 다시 한 번 권한을 확인한다. */
  update: (patch: Partial<LlmSettings>) => Promise<void>;
}

/**
 * 지금 쓸 수 있는 ID 토큰.
 *
 * 만료된 토큰으로 서버에 물으면 401 이 돌아오고 저장소는 기기 저장소로 내려간다.
 * 그러면 관리자가 서버에 저장한 설정이 없는 것처럼 보이므로, 만료는 미리 걸러 낸다.
 */
function currentIdToken(): string | null {
  const session = useAuthStore.getState().session;
  if (!session) return null;
  return isSessionValid(session, new Date().toISOString()) ? session.idToken : null;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: DEFAULT_LLM_SETTINGS,
      loading: false,
      storeKind: "unknown",

      async load() {
        set({ loading: true });
        try {
          const store = await resolveSettingsStore(currentIdToken());
          const settings = await store.get();
          set({ settings, storeKind: store.kind });
        } finally {
          set({ loading: false });
        }
      },

      async update(patch) {
        set({ loading: true });
        try {
          const store = await resolveSettingsStore(currentIdToken());
          const session = useAuthStore.getState().session;
          // 누가 언제 바꿨는지는 저장소가 아니라 부르는 쪽이 안다.
          // (서버 배포에서는 서버가 토큰에서 다시 확인해 덮어쓴다.)
          const settings = await store.set({
            ...patch,
            updatedBy: patch.updatedBy ?? session?.member.email,
            updatedAt: patch.updatedAt ?? new Date().toISOString(),
          });
          set({ settings, storeKind: store.kind });
        } finally {
          set({ loading: false });
        }
      },
    }),
    {
      name: "rolefit-llm-settings-view",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // 화면을 처음 그릴 때 쓰는 참고값일 뿐이다. 진짜 설정은 load() 가 저장소에서 읽는다.
      partialize: (s) => ({ settings: { ...s.settings, keyConfigured: false } }),
      merge: (persisted, current) => {
        const saved = (persisted as { settings?: Partial<LlmSettings> } | null)?.settings;
        return {
          ...current,
          // 키가 있는지는 서버만 안다. 브라우저에 저장된 값이 있다고 주장해도 믿지 않는다 —
          // 그 말을 믿으면 키 없이 모델을 부르려다 매번 실패하고, 사용자는 이유를 알 수 없다.
          settings: { ...normalizeSettings(saved), keyConfigured: false },
        };
      },
    },
  ),
);

export function useLlmSettings(): LlmSettings {
  return useSettingsStore((s) => s.settings);
}

export function useSettingsLoading(): boolean {
  return useSettingsStore((s) => s.loading);
}

export function useSettingsStoreKind(): "local" | "remote" | "unknown" {
  return useSettingsStore((s) => s.storeKind);
}

/**
 * 저장된 값을 다 읽기 전에는 화면을 그리지 않는다 — 서버 렌더 결과와 어긋나지 않도록.
 *
 * useAuthHydrated 와 같은 약속(서버에서는 false, 읽기가 끝나면 true)을 지키되
 * 구독을 React 에 맡긴다. 효과 안에서 상태를 다시 세우면 첫 그림이 두 번 그려진다.
 */
export function useSettingsHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => useSettingsStore.persist.onFinishHydration(onChange),
    () => useSettingsStore.persist.hasHydrated(),
    () => false,
  );
}
