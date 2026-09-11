/**
 * 정밀 분석 설정.
 *
 * ── 먼저 알아야 할 것 ────────────────────────────────────────
 * 이 앱은 지금까지 "지원자 자료는 이 기기를 떠나지 않는다" 를 지켜 왔다.
 * 공고도 이력도 분석서도 브라우저 안에서만 다뤘고, 그래서 기획서 14 의
 * "지원자 자료와 분석서는 기본 비공개" 가 말이 아니라 구조였다.
 *
 * 정밀 분석은 그 선을 넘는다. 공고와 이력을 모델에 보내야 하기 때문이다.
 * 그래서 다음 세 가지를 타입으로 강제한다.
 *
 *   1. 기본값은 꺼짐이다. 관리자가 켜야 쓸 수 있다.
 *   2. 켜져 있어도 지원자가 이번 분석에 대해 따로 동의해야 보낸다.
 *   3. 동의하지 않거나 실패하면 규칙 기반으로 돌아간다. 분석이 멈추지 않는다.
 *
 * 편의를 위해 조용히 켜 두는 선택지는 두지 않는다.
 */
import { DEFAULT_MODEL_ID, isAllowedModel } from "./models";

export interface LlmSettings {
  /** 관리자가 정밀 분석을 켰는가. 기본은 꺼짐. */
  enabled: boolean;
  /** 관리자가 고른 모델 */
  modelId: string;
  /**
   * 서버에 키가 설정되어 있는가.
   * 화면이 "관리자가 켰지만 키가 없어 동작하지 않는 상태" 를 구분해 알리기 위해 읽는다.
   * 키 자체는 절대 클라이언트로 내려보내지 않는다.
   */
  keyConfigured: boolean;
  /** 마지막으로 바꾼 사람과 시각 — 운영 기록 */
  updatedBy?: string;
  updatedAt?: string;
}

export const DEFAULT_LLM_SETTINGS: LlmSettings = {
  enabled: false,
  modelId: DEFAULT_MODEL_ID,
  keyConfigured: false,
};

/** 저장된 값이 망가져 있어도 앱이 멈추지 않도록 보정한다. */
export function normalizeSettings(raw: Partial<LlmSettings> | null | undefined): LlmSettings {
  const modelId =
    raw?.modelId && isAllowedModel(raw.modelId) ? raw.modelId : DEFAULT_MODEL_ID;
  return {
    enabled: raw?.enabled === true,
    modelId,
    keyConfigured: raw?.keyConfigured === true,
    updatedBy: raw?.updatedBy,
    updatedAt: raw?.updatedAt,
  };
}

/**
 * 이번 분석에 정밀 분석을 실제로 쓸 수 있는가.
 *
 * 세 가지가 모두 참이어야 한다. 하나라도 빠지면 규칙 기반으로 한다.
 * 이 함수를 거치지 않고 모델을 부르는 경로를 만들지 말 것.
 */
export function canUseLlm(settings: LlmSettings, applicantConsented: boolean): boolean {
  return settings.enabled && settings.keyConfigured && applicantConsented;
}

/** 왜 정밀 분석이 안 쓰이는지 — 화면이 그대로 보여 준다. */
export function llmUnavailableReason(
  settings: LlmSettings,
  applicantConsented: boolean,
): string | null {
  if (!settings.enabled) return "관리자가 정밀 분석을 켜지 않았습니다.";
  if (!settings.keyConfigured) {
    return "정밀 분석이 켜져 있지만 서버에 API 키가 없습니다. 관리자에게 알려 주세요.";
  }
  if (!applicantConsented) return "내 자료를 보내는 데 동의하지 않아 기기 안에서만 분석했습니다.";
  return null;
}
