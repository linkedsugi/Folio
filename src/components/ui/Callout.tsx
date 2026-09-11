/**
 * 안내 상자. "읽는 법", "제출 불가", "확인이 필요합니다" 같은 문장에 쓴다.
 *
 * 경고를 빨간 상자로만 표시하지 않는다 —
 * 무엇을 하라는 것인지 문장으로 적는 자리가 본체다.
 */
import clsx from "clsx";
import { TONE_ACCENT, TONE_SOFT, TONE_TEXT, type Tone } from "./tone";

export interface CalloutProps {
  tone?: Tone;
  title?: string;
  children?: React.ReactNode;
  /** 배경 없이 왼쪽 선만 — 문서 안에 끼워 넣을 때 */
  plain?: boolean;
  className?: string;
}

export function Callout({ tone = "neutral", title, children, plain, className }: CalloutProps) {
  return (
    <div
      className={clsx(
        "rounded-sm border-l-4 px-4 py-3",
        TONE_ACCENT[tone],
        plain ? "bg-canvas" : TONE_SOFT[tone],
        className,
      )}
    >
      {title ? (
        <p className={clsx("text-[13px] font-bold", plain ? TONE_TEXT[tone] : undefined)}>{title}</p>
      ) : null}
      {children ? (
        <div className={clsx("text-[13px] leading-relaxed text-ink", title && "mt-1")}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
