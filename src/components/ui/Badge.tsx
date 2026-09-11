/**
 * 작은 상태 표시. [필수]/[우대], "확인 필요", "제출 불가" 같은 짧은 꼬리표에 쓴다.
 *
 * 색만으로 뜻을 전달하지 않도록 언제나 글자를 함께 둔다.
 */
import clsx from "clsx";
import { TONE_SOFT, type Tone } from "./tone";

export type BadgeSize = "xs" | "sm";

export interface BadgeProps {
  tone?: Tone;
  /** xs 는 표 안처럼 촘촘한 자리에 쓴다 */
  size?: BadgeSize;
  children: React.ReactNode;
  /** 마우스를 올렸을 때 보여줄 설명 */
  title?: string;
  className?: string;
}

const SIZE: Record<BadgeSize, string> = {
  xs: "px-1.5 py-0.5 text-[11px]",
  sm: "px-2 py-0.5 text-[12px]",
};

export function Badge({ tone = "neutral", size = "sm", children, title, className }: BadgeProps) {
  return (
    <span
      title={title}
      className={clsx(
        "inline-flex shrink-0 items-center rounded-sm leading-snug font-semibold",
        SIZE[size],
        TONE_SOFT[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
