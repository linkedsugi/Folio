/**
 * 공용 UI 프리미티브.
 *
 * 화면은 언제나 여기서만 가져다 쓴다 — 같은 뜻의 표시가 화면마다 달라지면
 * 사용자는 "현재"와 "스토리 후"의 차이를 색으로 배울 수 없다.
 */

export { ScoreTriad, type ScoreTriadProps } from "./ScoreTriad";
export { MatchTable, type MatchTableProps } from "./MatchTable";
export { StageRail, type StageRailProps } from "./StageRail";

export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from "./Button";
export { Badge, type BadgeProps } from "./Badge";
export { Callout, type CalloutProps } from "./Callout";
export { Disclosure, type DisclosureProps } from "./Disclosure";
export {
  Field,
  TextInput,
  TextArea,
  Select,
  type FieldProps,
  type TextInputProps,
  type TextAreaProps,
  type SelectProps,
  type SelectOption,
} from "./Field";
export { EmptyState, type EmptyStateProps } from "./EmptyState";
export { Spinner, type SpinnerProps } from "./Spinner";
export { ScoreBar, type ScoreBarProps } from "./ScoreBar";
export { DocFrame, type DocFrameProps } from "./DocFrame";

export {
  STAGE_TONE,
  TONE_SOFT,
  TONE_ACCENT,
  TONE_TEXT,
  type StageTone,
  type StageToneClass,
  type Tone,
} from "./tone";
