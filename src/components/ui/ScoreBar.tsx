/**
 * 한 부문의 현재 → 스토리 후 → 목표를 한 줄로.
 *
 * 세 값은 서로 다른 수를 더한 것이 아니라 같은 축 위의 세 지점이다.
 * (스토리 후는 현재보다 낮을 수 없고, 목표는 스토리 후보다 낮을 수 없다 — scoring.normalizeDimension)
 * 그래서 막대를 쌓지 않고 겹쳐 그린다.
 */
import clsx from "clsx";
import { clampScore } from "@/lib/scoring";

export interface ScoreBarProps {
  current: number;
  afterStory: number;
  target: number;
  label?: string;
  /** 오른쪽에 33 → 45 → 72 형태로 값 표기 */
  showValues?: boolean;
  className?: string;
}

export function ScoreBar({
  current,
  afterStory,
  target,
  label,
  showValues = true,
  className,
}: ScoreBarProps) {
  const c = clampScore(current);
  const a = clampScore(Math.max(current, afterStory));
  const t = clampScore(Math.max(afterStory, target));

  return (
    <div className={clsx("min-w-0", className)}>
      {label || showValues ? (
        <div className="flex items-baseline justify-between gap-2">
          {label ? (
            <span className="min-w-0 truncate text-[12px] font-medium text-ink">{label}</span>
          ) : (
            <span />
          )}
          {showValues ? (
            <span className="tabular shrink-0 text-[11px] font-semibold">
              <span className="text-now">{c}</span>
              <span className="text-ink-faint"> → </span>
              <span className="text-story">{a}</span>
              <span className="text-ink-faint"> → </span>
              <span className="text-goal">{t}</span>
              <span className="text-ink-faint">%</span>
            </span>
          ) : null}
        </div>
      ) : null}

      <div
        role="img"
        aria-label={`현재 ${c}%, 스토리텔링 후 ${a}%, 목표 ${t}%`}
        className="relative mt-1 h-2.5 w-full overflow-hidden rounded-sm bg-surface-sunken"
      >
        {/* 뒤에서부터: 목표 → 스토리 후 → 현재 순으로 겹쳐 그린다. */}
        <span className="absolute inset-y-0 left-0 bg-goal-soft" style={{ width: `${t}%` }} />
        <span className="absolute inset-y-0 left-0 bg-story-soft" style={{ width: `${a}%` }} />
        <span className="absolute inset-y-0 left-0 bg-now" style={{ width: `${c}%` }} />
        {/* 경계 눈금 — 색이 옅어도 지점은 보이게 */}
        <span className="absolute inset-y-0 w-0.5 bg-story" style={{ left: `calc(${a}% - 2px)` }} />
        <span className="absolute inset-y-0 w-0.5 bg-goal" style={{ left: `calc(${t}% - 2px)` }} />
      </div>
    </div>
  );
}
