/**
 * 작은 상태 표시. [필수]/[우대], "확인 필요", "제출 불가" 같은 짧은 꼬리표에 쓴다.
 *
 * 색만으로 뜻을 전달하지 않도록 언제나 글자를 함께 둔다.
 */
import clsx from "clsx";
import { TONE_SOFT, type Tone } from "./tone";

export interface BadgeProps {
  tone?: Tone;
  children: React.ReactNode;
  /** 마우스를 올렸을 때 보여줄 설명 */
  title?: string;
  className?: string;
}

export function Badge({ tone = "neutral", children, title, className }: BadgeProps) {
  return (
    <span
      title={title}
      className={clsx(
        "inline-flex shrink-0 items-center rounded-sm px-1.5 py-px text-[11px] leading-snug font-semibold",
        TONE_SOFT[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
