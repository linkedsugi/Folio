/**
 * 부문별 비교표. (기획서 03)
 *
 *   모집팀의 기대 | 현재 | 스토리텔링에 활용할 경험 | 스토리 후 | 이후 진행할 부분 → 완료 증거 | 목표
 *
 * 이 표가 앱의 핵심 화면이다. 한 행을 가로로 읽으면
 * "팀이 무엇을 기대하는가 → 지금 어디인가 → 무엇을 연결할 수 있는가 →
 *  그래서 어디까지 설명되는가 → 무엇을 더 해야 하는가 → 그러면 어디에 닿는가"
 * 가 끊기지 않고 이어져야 한다. 그래서 좁은 화면에서도 열을 접지 않고,
 * 표 자체를 가로로 밀어 보게 한다(본문은 가로 스크롤되지 않는다).
 *
 * 총점과 필수 조건은 다른 정보이므로, 여기서는 [필수]/[우대] 를 라벨 옆에만 표시하고
 * 숫자로 합치지 않는다.
 */
"use client";

import type { KeyboardEvent } from "react";
import clsx from "clsx";
import { STORY_LIFT_LABEL, type MatchDimension } from "@/lib/types";
import type { MatchStage } from "@/lib/scoring";
import { Badge } from "./Badge";
import { STAGE_TONE, type Tone } from "./tone";

export interface MatchTableProps {
  dimensions: MatchDimension[];
  onSelect?: (id: string) => void;
  selectedId?: string | null;
  /** 지금 화면이 설명하는 단계의 열을 진하게 */
  emphasize?: MatchStage;
}

/** 필수·우대는 총점과 다른 정보이므로 숫자가 아니라 라벨 옆의 꼬리표로만 보여준다. */
const KIND_BADGE: Record<MatchDimension["kind"], { label: string; tone: Tone } | null> = {
  must: { label: "필수", tone: "danger" },
  preferred: { label: "우대", tone: "brand" },
  general: null,
};

export function MatchTable({ dimensions, onSelect, selectedId, emphasize }: MatchTableProps) {
  const interactive = typeof onSelect === "function";

  function handleKeyDown(e: KeyboardEvent<HTMLTableRowElement>, id: string) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect?.(id);
      return;
    }
    // 표 안에서는 위아래 화살표로 행을 옮겨 다니는 것이 자연스럽다.
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const next =
        e.key === "ArrowDown" ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling;
      if (next instanceof HTMLElement) {
        e.preventDefault();
        next.focus();
      }
    }
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-sm border border-rule bg-canvas">
        <table
          role={interactive ? "grid" : undefined}
          className="w-full min-w-[880px] border-separate border-spacing-0 text-left"
        >
          <caption className="sr-only">
            부문별 매칭 비교표. 열 구성: 모집팀의 기대, 현재, 스토리텔링에 활용할 경험, 스토리 후,
            이후 진행할 부분과 완료 증거, 목표.
            {interactive ? " 행을 선택하면 그 부문의 상세 근거를 볼 수 있습니다." : ""}
          </caption>

          <colgroup>
            <col className="w-[190px]" />
            <col className="w-[76px]" />
            <col className="w-[230px]" />
            <col className="w-[76px]" />
            <col className="w-[290px]" />
            <col className="w-[88px]" />
          </colgroup>

          <thead>
            <tr className="bg-ink text-white">
              <Th>모집팀의 기대</Th>
              <Th align="center" accent={emphasize === "current" ? "border-b-4 border-now" : undefined}>
                현재
              </Th>
              <Th>스토리텔링에 활용할 경험</Th>
              <Th
                align="center"
                accent={emphasize === "afterStory" ? "border-b-4 border-story" : undefined}
              >
                스토리 후
              </Th>
              <Th>이후 진행할 부분 → 완료 증거</Th>
              <Th align="center" accent={emphasize === "target" ? "border-b-4 border-goal" : undefined}>
                목표
              </Th>
            </tr>
          </thead>

          <tbody>
            {dimensions.map((d) => {
              const selected = selectedId === d.id;
              const kind = KIND_BADGE[d.kind];

              return (
                <tr
                  key={d.id}
                  tabIndex={interactive ? 0 : undefined}
                  aria-selected={interactive ? selected : undefined}
                  onClick={interactive ? () => onSelect?.(d.id) : undefined}
                  onKeyDown={interactive ? (e) => handleKeyDown(e, d.id) : undefined}
                  className={clsx(
                    "odd:bg-canvas even:bg-surface",
                    interactive && "cursor-pointer",
                    // 선택된 행은 표 전체에서 한눈에 찾을 수 있어야 한다.
                    // 행 배경은 셀마다 다르므로(현재/스토리 후/목표 셀은 각자의 색) 배경 대신 테두리로 표시한다.
                    selected
                      ? "ring-2 ring-brand ring-inset"
                      : interactive && "hover:ring-2 hover:ring-rule-strong hover:ring-inset",
                  )}
                >
                  <th
                    scope="row"
                    className="border-b border-rule px-3 py-2.5 text-left align-top font-normal"
                  >
                    <span className="flex flex-wrap items-center gap-1">
                      <span className="text-[13px] leading-snug font-bold text-ink">{d.label}</span>
                      {kind ? (
                        <Badge tone={kind.tone} size="xs">
                          {kind.label}
                        </Badge>
                      ) : null}
                      {d.confidence === "needs-confirmation" ? (
                        <Badge
                          tone="warn"
                          size="xs"
                          title={d.remainingGap || "근거 확인이 필요한 항목입니다."}
                        >
                          확인 필요
                        </Badge>
                      ) : null}
                    </span>
                    <span className="tabular mt-0.5 block text-[11px] text-ink-faint">
                      비중 {d.weight}%
                    </span>
                  </th>

                  <ScoreCell
                    value={d.current}
                    tone="now"
                    emphasized={emphasize === "current"}
                    interactive={interactive}
                  />

                  <TextCell interactive={interactive} emphasized={emphasize === "afterStory"}>
                    {d.storyBasis}
                    {/* 문장만 고쳐서 오른 값이 아니라는 것을 여기서 분명히 한다. */}
                    {d.storyLift !== "lifted" ? (
                      <span className="mt-0.5 block text-[10px] leading-snug text-ink-faint">
                        {STORY_LIFT_LABEL[d.storyLift]}
                      </span>
                    ) : null}
                  </TextCell>

                  <ScoreCell
                    value={d.afterStory}
                    tone="story"
                    emphasized={emphasize === "afterStory"}
                    interactive={interactive}
                  />

                  <TextCell interactive={interactive} emphasized={emphasize === "target"}>
                    {d.nextStep}
                    {d.evidenceToProduce ? (
                      <span className="mt-0.5 block text-[11px] leading-snug text-ink-faint">
                        → {d.evidenceToProduce}
                      </span>
                    ) : null}
                  </TextCell>

                  <ScoreCell
                    value={d.target}
                    tone="goal"
                    emphasized={emphasize === "target"}
                    interactive={interactive}
                    /* 목표에 닿아도 별도 확인이 필요한 조건은 숫자 밑에 그대로 남긴다. */
                    caveat={d.targetCaveat}
                  />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-1 text-[11px] text-ink-faint sm:hidden">
        표를 좌우로 밀면 나머지 열을 볼 수 있습니다.
      </p>
    </div>
  );
}

function Th({
  children,
  align,
  accent,
}: {
  children: React.ReactNode;
  align?: "center";
  accent?: string;
}) {
  return (
    <th
      scope="col"
      className={clsx(
        "px-3 py-2 text-[11px] leading-snug font-semibold",
        align === "center" ? "text-center" : "text-left",
        accent,
      )}
    >
      {children}
    </th>
  );
}

function ScoreCell({
  value,
  tone,
  emphasized,
  interactive,
  caveat,
}: {
  value: number;
  tone: "now" | "story" | "goal";
  emphasized: boolean;
  interactive: boolean;
  caveat?: string;
}) {
  const t = STAGE_TONE[tone];
  return (
    <td
      role={interactive ? "gridcell" : undefined}
      className={clsx("border-b border-rule px-2 py-2.5 text-center align-middle", t.soft)}
    >
      <span
        className={clsx(
          "tabular block leading-none font-bold",
          t.text,
          emphasized ? "text-[18px]" : "text-[14px]",
        )}
      >
        {value}%
      </span>
      {caveat ? (
        <span
          title={caveat}
          className="mt-1 line-clamp-2 block text-[10px] leading-snug text-ink-muted"
        >
          {caveat}
        </span>
      ) : null}
    </td>
  );
}

function TextCell({
  children,
  emphasized,
  interactive,
}: {
  children: React.ReactNode;
  emphasized: boolean;
  interactive: boolean;
}) {
  return (
    <td
      role={interactive ? "gridcell" : undefined}
      className={clsx(
        "border-b border-rule px-3 py-2.5 align-top text-[12px] leading-snug",
        emphasized ? "font-medium text-ink" : "text-ink-muted",
      )}
    >
      {children}
    </td>
  );
}
