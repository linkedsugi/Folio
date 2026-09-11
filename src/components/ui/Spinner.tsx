/**
 * 진행 표시.
 *
 * 무엇을 하는 중인지 함께 적는다 — 분석은 시간이 걸리고,
 * 사용자는 "멈춘 것"과 "읽는 중"을 구분할 수 있어야 한다.
 * 회전은 prefers-reduced-motion 에서 globals.css 가 멈춘다.
 */
import clsx from "clsx";

export interface SpinnerProps {
  /** 무슨 작업인지 — 화면에도 보여주려면 showLabel */
  label?: string;
  showLabel?: boolean;
  size?: "sm" | "md";
  className?: string;
}

const SIZE = { sm: "h-3.5 w-3.5 border-2", md: "h-5 w-5 border-2" } as const;

export function Spinner({ label = "불러오는 중", showLabel, size = "md", className }: SpinnerProps) {
  return (
    <span role="status" className={clsx("inline-flex items-center gap-2", className)}>
      <span
        aria-hidden
        className={clsx(
          "inline-block animate-spin rounded-full border-rule-strong border-t-brand",
          SIZE[size],
        )}
      />
      <span className={showLabel ? "text-[12px] text-ink-muted" : "sr-only"}>{label}</span>
    </span>
  );
}
