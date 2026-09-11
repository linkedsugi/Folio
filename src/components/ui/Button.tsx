/**
 * 버튼.
 *
 * 한 화면의 다음 행동은 하나만 primary 로 둔다. (기획서 10 — 지금 무엇을 해야 하는지 분명해야 한다)
 */
"use client";

import type { ButtonHTMLAttributes } from "react";
import clsx from "clsx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 너비를 부모에 맞춘다 (좁은 화면의 주요 행동) */
  block?: boolean;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: "border-ink bg-ink text-white enabled:hover:bg-ink-strong enabled:hover:border-ink-strong",
  secondary: "border-rule-strong bg-canvas text-ink enabled:hover:bg-surface-sunken",
  ghost: "border-transparent bg-transparent text-ink-muted enabled:hover:bg-surface-sunken enabled:hover:text-ink",
  danger: "border-danger bg-danger-soft text-danger enabled:hover:bg-danger enabled:hover:text-white",
};

/*
 * 손가락으로 누르는 크기를 먼저 정하고 글자를 맞춘다.
 * 지원 준비는 휴대폰으로도 하는 일인데, 잘못 눌러 되돌리는 경험이 쌓이면
 * 화면 자체를 불신하게 된다. sm 도 40px 아래로는 내려가지 않게 min-h 로 바닥을 깐다.
 */
const SIZE: Record<ButtonSize, string> = {
  sm: "min-h-10 px-3.5 py-2 text-[13px]",
  md: "min-h-11 px-5 py-2.5 text-[14px]",
};

export function Button({
  variant = "secondary",
  size = "md",
  block,
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      // 폼 안에서 실수로 제출되지 않도록 기본값은 언제나 button 이다.
      type={type}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-sm border font-semibold transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT[variant],
        SIZE[size],
        block && "w-full",
        className,
      )}
      {...rest}
    />
  );
}
