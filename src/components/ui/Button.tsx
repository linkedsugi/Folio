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

const SIZE: Record<ButtonSize, string> = {
  sm: "px-2.5 py-1 text-[12px]",
  md: "px-3.5 py-2 text-[13px]",
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
        "inline-flex items-center justify-center gap-1.5 rounded-sm border font-semibold transition-colors",
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
