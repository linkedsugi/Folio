/**
 * 고를 수 있는 모델 목록.
 *
 * 관리자가 최신 모델 중에서 고른다. 목록을 코드에 두는 이유:
 * 임의의 문자열을 받으면 오타 하나로 모든 분석이 조용히 실패하고,
 * 사용자는 "왜 결과가 규칙 기반으로 돌아갔는지" 알 수 없게 된다.
 */

export interface ModelOption {
  id: string;
  /** 화면에 쓰는 이름 */
  label: string;
  /** 어떤 때에 고르면 좋은가 */
  note: string;
  /** 상대적인 무게. 화면에서 정렬과 표시에 쓴다. */
  tier: "max" | "balanced" | "fast";
}

/**
 * 2026-09 기준 최신 모델.
 *
 * 주의: "Opus 5.1" 은 없다. 최신 Opus 는 Opus 5 이고,
 * 5.1 버전이 있는 것은 Fable 이다. 목록을 늘릴 때 이 점을 확인할 것.
 */
export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: "claude-opus-5",
    label: "Opus 5",
    note: "가장 정확합니다. 근거를 따지고 과장을 걸러내는 일에 강해서 이 앱의 기본값입니다.",
    tier: "max",
  },
  {
    id: "claude-fable-5-1",
    label: "Fable 5.1",
    note: "문장을 다듬는 데 강합니다. 이력서 표현을 더 자연스럽게 쓰고 싶을 때 고릅니다.",
    tier: "max",
  },
  {
    id: "claude-sonnet-5",
    label: "Sonnet 5",
    note: "정확도와 속도가 균형 잡혀 있습니다. 분석량이 많을 때 고릅니다.",
    tier: "balanced",
  },
  {
    id: "claude-haiku-4-5-20251001",
    label: "Haiku 4.5",
    note: "가장 빠르고 저렴합니다. 결과를 빨리 훑어볼 때만 쓰고, 최종 판단에는 권하지 않습니다.",
    tier: "fast",
  },
];

/** 아무도 고르지 않았을 때 쓰는 모델. */
export const DEFAULT_MODEL_ID = "claude-opus-5";

export function findModel(id: string | undefined | null): ModelOption | undefined {
  if (!id) return undefined;
  return MODEL_OPTIONS.find((m) => m.id === id);
}

/**
 * 목록에 없는 모델은 받지 않는다.
 * 잘못된 이름이 저장되면 분석이 매번 실패하는데, 실패가 조용하면 원인을 찾기 어렵다.
 */
export function isAllowedModel(id: string): boolean {
  return MODEL_OPTIONS.some((m) => m.id === id);
}

export const TIER_LABEL: Record<ModelOption["tier"], string> = {
  max: "정밀",
  balanced: "균형",
  fast: "빠름",
};
