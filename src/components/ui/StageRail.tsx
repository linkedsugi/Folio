/**
 * 6단계 진행 표시. (기획서 10)
 *
 * 사용자가 "지금 어느 단계에 있고, 이 단계를 지나면 무엇이 나오는가"를
 * 언제나 알 수 있어야 한다. 그래서 단계 이름만 두지 않고
 * 그 단계의 결과물(이력서 1·2·3)을 함께 적는다.
 *
 * 지나온 단계는 되돌아갈 수 있고(결과는 유지된다), 아직 도달하지 않은 단계는
 * 누를 수 없다 — 건너뛰면 근거 없는 결과가 만들어지기 때문이다.
 */
"use client";

import clsx from "clsx";
import { STAGE_LABEL, STAGE_ORDER, type StageId } from "@/lib/types";

export interface StageRailProps {
  current: StageId;
  completed: StageId[];
  onSelect?: (s: StageId) => void;
}

/** 'start' 는 진행 단계가 아니라 진입점이므로 레일에 넣지 않는다. */
const RAIL_STAGES: StageId[] = STAGE_ORDER.filter((s) => s !== "start");

export function StageRail({ current, completed, onSelect }: StageRailProps) {
  return (
    <nav aria-label="진행 단계">
      {/* 좁은 화면에서는 이 줄만 가로로 밀린다. 본문은 밀리지 않는다. */}
      <ol className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1.5">
        {RAIL_STAGES.map((s) => {
          const meta = STAGE_LABEL[s];
          const isCurrent = s === current;
          const isDone = completed.includes(s);
          const reachable = isCurrent || isDone;
          const enabled = Boolean(onSelect) && reachable;

          return (
            <li key={s} className="shrink-0">
              <button
                type="button"
                disabled={!enabled}
                title={meta.desc}
                aria-current={isCurrent ? "step" : undefined}
                onClick={enabled ? () => onSelect?.(s) : undefined}
                className={clsx(
                  // 칩이 작으면 되돌아가기가 겁나는 일이 된다. 손끝으로 눌러도
                  // 빗나가지 않도록 최소 높이를 44px 로 두고, h-full 로 여섯 칩의 키를 맞춘다.
                  /*
                   * relative 가 반드시 있어야 한다.
                   * 아래 sr-only 스팬은 position:absolute 인데, 위치 기준이 될 조상이 없으면
                   * 가로 스크롤 컨테이너(ol)를 탈출해 문서 바깥에 자리를 잡는다.
                   * 그러면 390px 화면에서 페이지 전체가 448px 옆으로 밀리고,
                   * 오른쪽 끝에는 텅 빈 여백만 남는다. 실제로 그렇게 됐던 자리다.
                   */
                  "relative flex h-full min-h-11 items-center gap-2.5 rounded-sm border px-3.5 py-2 text-left transition-colors",
                  isCurrent
                    ? "border-ink bg-ink text-white"
                    : isDone
                      ? "border-rule-strong bg-canvas text-ink enabled:hover:bg-surface-sunken"
                      : "cursor-not-allowed border-rule bg-surface text-ink-faint",
                )}
              >
                <span
                  className={clsx(
                    "tabular flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-[12px] font-bold",
                    isCurrent
                      ? "bg-canvas text-ink"
                      : isDone
                        ? "bg-brand-soft text-brand"
                        : "bg-surface-sunken text-ink-faint",
                  )}
                >
                  {meta.step}
                </span>

                <span className="block">
                  <span className="block text-[13px] leading-tight font-semibold whitespace-nowrap">
                    {meta.title}
                  </span>
                  {meta.output ? (
                    <span
                      className={clsx(
                        "mt-0.5 block text-[11px] leading-tight whitespace-nowrap",
                        isCurrent ? "text-white/80" : isDone ? "text-ink-muted" : "text-ink-faint",
                      )}
                    >
                      {meta.output}
                    </span>
                  ) : null}
                </span>

                {/* 완료 여부는 색만으로 전달하지 않는다. */}
                {isDone && !isCurrent ? <span className="sr-only">완료</span> : null}
                {!reachable ? <span className="sr-only">아직 진행할 수 없음</span> : null}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
