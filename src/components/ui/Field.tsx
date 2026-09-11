/**
 * 입력 묶음 — 라벨 · 설명 · 오류를 한 번에 연결한다.
 *
 * 라벨과 입력, 설명과 오류를 id 로 묶는 일을 화면마다 되풀이하면
 * 어딘가는 반드시 빠진다. 그래서 여기서 한 번만 연결한다.
 *
 * 이 앱은 "모르면 비워 두는" 것을 허용한다(확인 필요로 남는다).
 * 그래서 필수 표시는 정말 필요한 곳에만 쓴다.
 */
"use client";

import { useId, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import clsx from "clsx";

export interface FieldProps {
  label: string;
  /** 왜 묻는지 한 줄 */
  hint?: string;
  error?: string;
  required?: boolean;
  /** 입력 요소의 id — 라벨을 여기에 연결한다 */
  htmlFor: string;
  children: React.ReactNode;
  className?: string;
}

export function Field({ label, hint, error, required, htmlFor, children, className }: FieldProps) {
  return (
    <div className={clsx("min-w-0", className)}>
      <label htmlFor={htmlFor} className="block text-[12px] font-semibold text-ink">
        {label}
        {required ? (
          <span className="ml-1 text-danger" title="필수 입력">
            *
          </span>
        ) : null}
      </label>
      {hint ? (
        <p id={`${htmlFor}-hint`} className="mt-0.5 text-[11px] leading-snug text-ink-faint">
          {hint}
        </p>
      ) : null}
      <div className="mt-1">{children}</div>
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="mt-1 text-[11px] font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const CONTROL =
  "w-full rounded-sm border bg-canvas px-2.5 py-1.5 text-[13px] leading-relaxed text-ink placeholder:text-ink-faint disabled:cursor-not-allowed disabled:bg-surface-sunken";

function describedBy(id: string, hint?: string, error?: string): string | undefined {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean);
  return ids.length ? ids.join(" ") : undefined;
}

interface ControlExtras {
  label: string;
  hint?: string;
  error?: string;
  fieldClassName?: string;
}

export type TextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> &
  ControlExtras & { className?: string };

export function TextInput({
  label,
  hint,
  error,
  fieldClassName,
  className,
  id,
  required,
  ...rest
}: TextInputProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      htmlFor={fieldId}
      className={fieldClassName}
    >
      <input
        id={fieldId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, error)}
        className={clsx(CONTROL, error ? "border-danger" : "border-rule-strong", className)}
        {...rest}
      />
    </Field>
  );
}

export type TextAreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> &
  ControlExtras & { className?: string };

export function TextArea({
  label,
  hint,
  error,
  fieldClassName,
  className,
  id,
  required,
  rows = 6,
  ...rest
}: TextAreaProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      htmlFor={fieldId}
      className={fieldClassName}
    >
      <textarea
        id={fieldId}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, error)}
        className={clsx(CONTROL, "resize-y", error ? "border-danger" : "border-rule-strong", className)}
        {...rest}
      />
    </Field>
  );
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "className" | "children"> &
  ControlExtras & { options: SelectOption[]; className?: string };

export function Select({
  label,
  hint,
  error,
  fieldClassName,
  className,
  options,
  id,
  required,
  ...rest
}: SelectProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      htmlFor={fieldId}
      className={fieldClassName}
    >
      <select
        id={fieldId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, error)}
        className={clsx(CONTROL, error ? "border-danger" : "border-rule-strong", className)}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
