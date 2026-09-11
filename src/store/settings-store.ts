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
import { resolveSettingsStore, type SettingsFailure } from "@/lib/llm/settings-store";
import { isSessionValid } from "@/lib/auth/types";
import { useAuthStore } from "./auth-store";

/**
 * 이번 분석이 어느 길로 갔는가.
 *
 * 결과 화면이 "이 수치는 무엇으로 만들어졌나" 를 말할 수 있어야 하므로 남긴다.
 * 규칙 기반으로 갔다면 그 이유까지 있어야 한다 — 정밀 분석을 켜 둔 사람이
 * 왜 이번에는 쓰이지 않았는지 알 수 없으면, 켜 둔 것 자체를 의심하게 된다.
 */
export interface AnalysisOutcome {
  /** 정밀 분석이 실제로 쓰였는가. false 면 화면에 보이는 것은 규칙 기반 결과다. */
  usedLlm: boolean;
  /** 규칙 기반으로 간 이유. 정밀 분석이 그대로 쓰였으면 null. */
  reason: string | null;
  /** 실제로 쓰인 모델 — 정밀 분석이 쓰였을 때만 */
  modelId?: string;
  at: string;
}

interface SettingsState {
  settings: LlmSettings;
  loading: boolean;
  /**
   * 설정이 서버에 있는지 이 기기에만 있는지.
   * 관리 화면이 "이 배포에서는 정밀 분석을 쓸 수 없다" 를 구분해 알리기 위해 읽는다.
   */
  storeKind: "local" | "remote" | "unknown";
  /**
   * 마지막으로 설정을 바꾸려다 실패한 이유.
   * 실패를 상태로 들고 있지 않으면 화면은 되돌아간 체크박스만 보여 주게 된다.
   */
  error: SettingsFailure | null;
  /**
   * 마지막 분석이 정밀이었는지 규칙 기반이었는지.
   * 저장하지 않는다 — 지원 건마다 다른 값인데 이 저장소는 지원 건을 모르기 때문이다.
   * 새로 분석할 때마다 다시 세운다.
   */
  lastAnalysis: AnalysisOutcome | null;

  load: () => Promise<void>;
  /** 관리자만 부른다. 서버 배포에서는 서버가 다시 한 번 권한을 확인한다. */
  update: (patch: Partial<LlmSettings>) => Promise<void>;
  /** 분석을 마친 화면이 어느 길로 갔는지 여기에 남긴다. */
  noteAnalysis: (outcome: AnalysisOutcome) => void;
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
      error: null,
      lastAnalysis: null,

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
        // 새로 시도하는 순간 지난 실패 문구는 치운다. 남겨 두면 방금 성공한 변경을
        // 실패한 것처럼 읽게 된다.
        set({ loading: true, error: null });
        try {
          const store = await resolveSettingsStore(currentIdToken());
          const session = useAuthStore.getState().session;
          // 누가 언제 바꿨는지는 저장소가 아니라 부르는 쪽이 안다.
          // (서버 배포에서는 서버가 토큰에서 다시 확인해 덮어쓴다.)
          const { error, ...settings } = await store.set({
            ...patch,
            updatedBy: patch.updatedBy ?? session?.member.email,
            updatedAt: patch.updatedAt ?? new Date().toISOString(),
          });
          // 실패했으면 settings 는 서버의 현재 값이다 — 바꾸려던 값이 아니라.
          // 되돌아간 값과 그 이유를 함께 들고 있어야 화면이 둘을 같이 보여 줄 수 있다.
          set({ settings, storeKind: store.kind, error: error ?? null });
        } finally {
          set({ loading: false });
        }
      },

      noteAnalysis: (outcome) => set({ lastAnalysis: outcome }),
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

/** 마지막 설정 변경이 실패한 이유. 없으면 null. */
export function useSettingsError(): SettingsFailure | null {
  return useSettingsStore((s) => s.error);
}

/** 마지막 분석이 어느 길로 갔는지. 아직 분석한 적이 없으면 null. */
export function useLastAnalysis(): AnalysisOutcome | null {
  return useSettingsStore((s) => s.lastAnalysis);
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
