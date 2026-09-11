/**
 * 실행 카드. (기획서 06)
 *
 * "더 공부하세요" 대신, 무엇을 하고 무엇을 보여주면 다시 평가할 수 있는지 제시한다.
 * 여섯 가지가 반드시 들어간다:
 *   부족한 기대 / 현재 → 목표 / 진행할 일 / 완료 증거 / 진행 조건 / 재평가 기준
 *
 * 완료 체크만으로는 점수가 오르지 않는다. (기획서 10)
 * 그래서 상태는 '진행 중'과 '증거 제출'을 구분하고, 증거 설명이 비면 재평가하지 않는다.
 */
"use client";

import { useState } from "react";
import { PRIORITY_DONE_CRITERIA, PRIORITY_LABEL, type ActionCard } from "@/lib/types";

export function ActionCardView({
  card,
  onStatusChange,
  onSaveToPlan,
}: {
  card: ActionCard;
  onStatusChange?: (status: ActionCard["status"], evidence?: string) => void;
  onSaveToPlan?: (saved: boolean) => void;
}) {
  const [evidence, setEvidence] = useState(card.submittedEvidence ?? "");
  const [open, setOpen] = useState(false);

  return (
    <article className="rounded-sm border border-rule bg-canvas">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-rule px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-sm bg-surface-sunken px-1.5 py-0.5 text-[11px] font-semibold text-ink-muted">
              {card.priority} {PRIORITY_LABEL[card.priority]}
            </span>
          </div>
          {/* ① 부족한 기대 */}
          <h3 className="mt-1.5 text-sm font-bold text-ink">{card.gap}</h3>
        </div>
        {/* ② 현재 → 목표 */}
        <p className="tabular shrink-0 text-sm font-bold">
          <span className="text-story">{card.from}%</span>
          <span className="mx-1 text-ink-faint">→</span>
          <span className="text-goal">{card.to}%</span>
        </p>
      </header>

      <div className="space-y-3 px-4 py-3">
        {/* ③ 진행할 일 */}
        <Block label="진행할 일">
          <ol className="space-y-1">
            {card.actions.map((a, i) => (
              <li key={i} className="flex gap-2 text-[13px]">
                <span className="tabular shrink-0 text-ink-faint">{i + 1}.</span>
                <span>{a}</span>
              </li>
            ))}
          </ol>
        </Block>

        {/* ④ 완료 증거 */}
        <Block label="완료 증거">
          <ul className="flex flex-wrap gap-1.5">
            {card.evidence.map((e, i) => (
              <li key={i} className="rounded-sm bg-goal-soft px-1.5 py-0.5 text-[12px] text-goal">
                {e}
              </li>
            ))}
          </ul>
        </Block>

        <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
          <summary className="cursor-pointer list-none text-[13px] font-medium text-brand hover:underline">
            진행 조건과 재평가 기준 {open ? "닫기" : "보기"}
          </summary>
          <div className="mt-2 space-y-3">
            {/* ⑤ 진행 조건 */}
            <Block label="진행 조건">
              <ul className="space-y-0.5">
                {card.conditions.map((c, i) => (
                  <li key={i} className="text-[13px] text-ink-muted">
                    · {c}
                  </li>
                ))}
              </ul>
            </Block>
            {/* ⑥ 재평가 기준 */}
            <Block label="재평가 기준">
              <p className="text-[13px] text-ink-muted">{card.reassessCriteria}</p>
              <p className="mt-1 text-[12px] text-ink-faint">
                완료 판단: {PRIORITY_DONE_CRITERIA[card.priority]}
              </p>
            </Block>
          </div>
        </details>
      </div>

      {onStatusChange ? (
        <footer className="space-y-2 border-t border-rule bg-surface px-4 py-3">
          <div className="flex flex-wrap gap-1.5">
            {(["todo", "in-progress", "evidence-submitted"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onStatusChange(s, s === "evidence-submitted" ? evidence : undefined)}
                className={[
                  "rounded-sm border px-2 py-1 text-[12px] font-medium transition-colors",
                  card.status === s
                    ? "border-ink bg-ink text-white"
                    : "border-rule-strong bg-canvas text-ink-muted hover:border-ink hover:text-ink",
                ].join(" ")}
              >
                {s === "todo" ? "아직" : s === "in-progress" ? "진행 중" : "증거 제출"}
              </button>
            ))}
            {onSaveToPlan ? (
              <button
                type="button"
                onClick={() => onSaveToPlan(!card.savedToPlan)}
                className="ml-auto rounded-sm border border-rule-strong bg-canvas px-2 py-1 text-[12px] font-medium text-ink-muted hover:border-ink hover:text-ink"
              >
                {card.savedToPlan ? "✓ 준비 과제에 저장됨" : "준비 과제로 저장"}
              </button>
            ) : null}
          </div>

          {card.status === "evidence-submitted" ? (
            <div>
              <label
                htmlFor={`ev-${card.id}`}
                className="block text-[12px] font-medium text-ink"
              >
                무엇을 만들었고, 그중 본인 역할은 어디까지였나요?
              </label>
              <textarea
                id={`ev-${card.id}`}
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
                onBlur={() => onStatusChange("evidence-submitted", evidence)}
                rows={3}
                placeholder="예: 동일 조건에서 로딩 4.0초 → 2.6초. 병목 분석과 수정 커밋은 본인 작성, 리뷰는 팀 리드."
                className="mt-1 w-full rounded-sm border border-rule-strong bg-canvas px-2 py-1.5 text-[13px] text-ink placeholder:text-ink-faint"
              />
              <p className="mt-1 text-[11px] leading-snug text-ink-faint">
                체크만으로는 점수가 오르지 않습니다. 결과물과 본인 역할을 적어야 해당 부문을
                재평가합니다.
              </p>
            </div>
          ) : null}
        </footer>
      ) : null}
    </article>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold tracking-wide text-ink-faint">{label}</p>
      {children}
    </div>
  );
}
