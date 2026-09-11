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
      <header className="border-b border-rule px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <span className="rounded-sm bg-surface-sunken px-2 py-0.5 text-[12px] font-semibold text-ink-muted">
            {card.priority} {PRIORITY_LABEL[card.priority]}
          </span>
          {/* 현재 → 목표 */}
          <p className="tabular shrink-0 text-[15px] font-bold">
            <span className="text-story">{card.from}%</span>
            <span className="mx-1.5 text-ink-faint">→</span>
            <span className="text-goal">{card.to}%</span>
          </p>
        </div>

        {/*
          설계의 출발점은 "부족한 것"이 아니라 "미래 이력서에 쓰고 싶은 문장"이다.
          그래야 강의 목록이 아니라 확보할 경력의 설계도가 된다.
          카드에서 가장 먼저 읽혀야 할 것이 이 문장이므로, 아래 설명들보다 크게 둔다.
        */}
        <p className="mt-3 text-[12px] font-semibold tracking-wide text-goal">
          이력서 3에 쓰고 싶은 문장
        </p>
        <blockquote className="mt-1.5 rounded-sm border-l-[3px] border-goal bg-goal-soft px-4 py-3 text-[15px] leading-relaxed font-semibold text-ink">
          “{card.targetSentence}”
        </blockquote>
        <p className="mt-2.5 text-[13px] leading-relaxed text-ink-muted">
          <span className="font-semibold text-ink">이 문장을 사실로 만들려면:</span>{" "}
          {card.experienceNeeded}
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-ink-faint">부족한 기대: {card.gap}</p>
      </header>

      <div className="space-y-4 px-5 py-4">
        {/* ③ 진행할 일 */}
        <Block label="진행할 일">
          <ol className="space-y-1.5">
            {card.actions.map((a, i) => (
              <li key={i} className="flex gap-3 text-[14px] leading-relaxed">
                <span className="tabular shrink-0 text-ink-faint">{i + 1}.</span>
                <span>{a}</span>
              </li>
            ))}
          </ol>
        </Block>

        {/* ④ 완료 증거 */}
        <Block label="완료 증거">
          <ul className="flex flex-wrap gap-2">
            {card.evidence.map((e, i) => (
              <li key={i} className="rounded-sm bg-goal-soft px-2 py-1 text-[13px] text-goal">
                {e}
              </li>
            ))}
          </ul>
        </Block>

        <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
          <summary className="cursor-pointer list-none text-[14px] font-medium text-brand hover:underline">
            진행 조건과 재평가 기준 {open ? "닫기" : "보기"}
          </summary>
          <div className="mt-3 space-y-4">
            {/* ⑤ 진행 조건 */}
            <Block label="진행 조건">
              <ul className="space-y-1">
                {card.conditions.map((c, i) => (
                  <li key={i} className="text-[14px] leading-relaxed text-ink-muted">
                    · {c}
                  </li>
                ))}
              </ul>
            </Block>
            {/* ⑥ 재평가 기준 */}
            <Block label="재평가 기준">
              <p className="text-[14px] leading-relaxed text-ink-muted">{card.reassessCriteria}</p>
              <p className="mt-1.5 text-[13px] text-ink-faint">
                완료 판단: {PRIORITY_DONE_CRITERIA[card.priority]}
              </p>
              {/* 이 과제가 끝나면 문장이 어디로 가는지 미리 알려 준다. */}
              <p className="mt-2 rounded-sm bg-story-soft px-3 py-2 text-[13px] leading-relaxed text-story">
                {card.promotedLineId
                  ? "확인을 마쳐 이력서 1·2 의 사실 문장으로 옮겨졌습니다."
                  : "재평가를 통과하면 위 문장이 [예정] 표시를 떼고 이력서 1·2 로 옮겨갑니다."}
              </p>
            </Block>
          </div>
        </details>
      </div>

      {onStatusChange ? (
        <footer className="space-y-3 border-t border-rule bg-surface px-5 py-4">
          <div className="flex flex-wrap gap-2">
            {(["todo", "in-progress", "evidence-submitted"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onStatusChange(s, s === "evidence-submitted" ? evidence : undefined)}
                className={[
                  "rounded-sm border px-3 py-2 text-[13px] font-medium transition-colors",
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
                className="ml-auto rounded-sm border border-rule-strong bg-canvas px-3 py-2 text-[13px] font-medium text-ink-muted hover:border-ink hover:text-ink"
              >
                {card.savedToPlan ? "✓ 준비 과제에 저장됨" : "준비 과제로 저장"}
              </button>
            ) : null}
          </div>

          {card.status === "evidence-submitted" ? (
            <div>
              <label
                htmlFor={`ev-${card.id}`}
                className="block text-[13px] font-medium text-ink"
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
                className="mt-1.5 w-full rounded-sm border border-rule-strong bg-canvas px-3 py-2 text-[14px] text-ink placeholder:text-ink-faint"
              />
              <p className="mt-1.5 text-[12px] leading-relaxed text-ink-faint">
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
      <p className="mb-1.5 text-[12px] font-semibold tracking-wide text-ink-faint">{label}</p>
      {children}
    </div>
  );
}
