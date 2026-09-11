/**
 * 펼쳐 보는 근거. "왜 이렇게 해석했나요?" / "왜 이 경험을 넣었나요?" (기획서 04·08)
 *
 * details/summary 를 그대로 쓴다. 자바스크립트 없이도 열리고,
 * 브라우저 안에서 찾기(Ctrl+F)와 인쇄가 자연스럽게 동작하기 때문이다.
 */
import clsx from "clsx";

export interface DisclosureProps {
  summary: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  /** 같은 이름을 주면 한 번에 하나만 열린다 */
  name?: string;
  className?: string;
}

export function Disclosure({ summary, children, defaultOpen, name, className }: DisclosureProps) {
  return (
    <details
      open={defaultOpen}
      name={name}
      className={clsx("group rounded-sm border border-rule bg-canvas", className)}
    >
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-[12px] font-semibold text-brand hover:bg-surface-sunken">
        <span aria-hidden className="text-[10px] transition-transform group-open:rotate-90">
          ▶
        </span>
        <span className="min-w-0 flex-1">{summary}</span>
      </summary>
      <div className="border-t border-rule px-3 py-2 text-[12px] leading-relaxed text-ink">
        {children}
      </div>
    </details>
  );
}
