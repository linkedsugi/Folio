/**
 * 비어 있는 자리.
 *
 * "아직 없습니다"로 끝내지 않고 무엇을 하면 채워지는지까지 적는다.
 * 자료가 없어서 비어 있는 것과, 근거가 없어서 만들지 않은 것은 다른 상태이므로
 * 문구는 부르는 쪽에서 정한다.
 */
import clsx from "clsx";

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** 다음 행동 (버튼 등) */
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={clsx(
        "rounded-sm border border-dashed border-rule-strong bg-canvas px-5 py-8 text-center",
        className,
      )}
    >
      <p className="text-[14px] font-bold text-ink">{title}</p>
      {description ? (
        <p className="mx-auto mt-1.5 max-w-prose text-[13px] leading-relaxed text-ink-muted">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
