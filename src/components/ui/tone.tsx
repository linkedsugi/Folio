/**
 * 공용 색 조합표.
 *
 * Tailwind v4 는 소스에 **그대로 적힌 클래스 이름**만 추출한다.
 * `bg-${tone}-soft` 처럼 조립하면 CSS 가 생성되지 않으므로,
 * 색은 언제나 이 표에서 완성된 문자열로 꺼내 쓴다.
 *
 * 또 하나: 같은 속성의 유틸리티를 두 개 겹쳐 쓰지 않는다.
 * (border-rule 과 border-now 를 함께 주면 어느 쪽이 이길지는 클래스 순서가 아니라
 *  생성된 CSS 순서가 정하므로, 조건부로 "둘 중 하나"만 붙인다.)
 */

/** 매칭 3단계의 색 — 현재(청색) · 스토리 후(민트) · 목표(황색) */
export type StageTone = "now" | "story" | "goal";

export interface StageToneClass {
  /** 숫자·강조 글자색 */
  text: string;
  /** 셀 배경 */
  soft: string;
  /** 옅은 테두리 */
  rule: string;
  /** 진한 테두리 (강조용) */
  border: string;
}

export const STAGE_TONE: Record<StageTone, StageToneClass> = {
  now: { text: "text-now", soft: "bg-now-soft", rule: "border-now-rule", border: "border-now" },
  story: {
    text: "text-story",
    soft: "bg-story-soft",
    rule: "border-story-rule",
    border: "border-story",
  },
  goal: { text: "text-goal", soft: "bg-goal-soft", rule: "border-goal-rule", border: "border-goal" },
};

/** 뱃지·알림의 의미 색 */
export type Tone = "neutral" | "brand" | "now" | "story" | "goal" | "ok" | "warn" | "danger";

/** 배경 + 글자색 한 쌍 */
export const TONE_SOFT: Record<Tone, string> = {
  neutral: "bg-surface-sunken text-ink-muted",
  brand: "bg-brand-soft text-brand",
  now: "bg-now-soft text-now",
  story: "bg-story-soft text-story",
  goal: "bg-goal-soft text-goal",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
};

/** 알림 왼쪽 강조선 */
export const TONE_ACCENT: Record<Tone, string> = {
  neutral: "border-l-rule-strong",
  brand: "border-l-brand",
  now: "border-l-now",
  story: "border-l-story",
  goal: "border-l-goal",
  ok: "border-l-ok",
  warn: "border-l-warn",
  danger: "border-l-danger",
};

/** 글자색만 필요할 때 */
export const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-ink-muted",
  brand: "text-brand",
  now: "text-now",
  story: "text-story",
  goal: "text-goal",
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
};
