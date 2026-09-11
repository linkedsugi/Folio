/**
 * 경험 스토리 카드. (기획서 05)
 *
 * 새 경험을 만들어 넣는 것이 아니라, 실제 경험 속에서 이 직무와 연결되는 의미와 증거를 찾는다.
 * 한 항목은 하나의 이야기로 완성한다:
 *   팀의 기대 → 활용할 내 경험 → 이 직무와의 공통점 → 실제 증거
 *   → 이력서 문장·면접 답변 → 보완 후 매칭률과 여전히 남는 차이
 */
"use client";

import type { StoryCard } from "@/lib/types";
import { RefinedMark } from "./RefinedMark";
import type { RefinedLookup } from "./refined";

export function StoryCardView({
  card,
  onAdopt,
  refined,
}: {
  card: StoryCard;
  onAdopt?: (adopted: boolean) => void;
  /** 정밀 분석이 다듬은 자리 조회. 넘기지 않으면 표식이 하나도 뜨지 않는다. */
  refined?: RefinedLookup;
}) {
  return (
    <article className="rounded-sm border border-rule bg-canvas">
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule bg-story-soft px-5 py-3">
        <h3 className="text-[15px] leading-snug font-bold text-ink">{card.teamExpectation}</h3>
        <p className="tabular shrink-0 text-[15px] font-bold">
          <span className="text-now">{card.from}%</span>
          <span className="mx-1.5 text-ink-faint">→</span>
          <span className="text-story">{card.to}%</span>
        </p>
      </header>

      <div className="divide-y divide-rule">
        <Row label="활용할 내 경험">
          <p className="text-[14px] leading-relaxed">{card.usedExperience}</p>
        </Row>

        <Row label="연결 논리">
          <p className="text-[14px] leading-relaxed">
            {card.connectionLogic}
            <RefinedMark refined={refined?.(`story:${card.id}:connectionLogic`)} />
          </p>
        </Row>

        {card.evidence.length > 0 ? (
          <Row label="실제 증거">
            <ul className="flex flex-wrap gap-2">
              {card.evidence.map((e, i) => (
                <li key={i} className="rounded-sm bg-surface-sunken px-2 py-1 text-[13px] text-ink-muted">
                  {e}
                </li>
              ))}
            </ul>
          </Row>
        ) : null}

        <Row label="이력서 문장">
          {/* 이 문장이 그대로 이력서 2 에 들어간다. 두 결과물의 문장이 일치해야 한다. (기획서 14) */}
          <blockquote className="border-l-2 border-story pl-3.5 text-[14px] leading-relaxed text-ink">
            “{card.resumeSentence}”
            <RefinedMark refined={refined?.(`story:${card.id}:resumeSentence`)} />
          </blockquote>
        </Row>

        <Row label="면접 설명">
          <p className="text-[14px] leading-relaxed text-ink-muted">
            “{card.interviewNote}”
            <RefinedMark refined={refined?.(`story:${card.id}:interviewNote`)} />
          </p>
        </Row>

        <Row label="보완 범위와 한계">
          <p className="text-[14px] leading-relaxed text-warn">{card.scopeAndLimit}</p>
        </Row>
      </div>

      {onAdopt ? (
        <footer className="flex items-center justify-between gap-4 border-t border-rule bg-surface px-5 py-3">
          <p className="text-[12px] leading-snug text-ink-faint">
            채택하면 이력서 2에 이 문장이 들어갑니다.
          </p>
          <button
            type="button"
            onClick={() => onAdopt(!card.adopted)}
            aria-pressed={card.adopted}
            className={[
              "shrink-0 rounded-sm border px-3.5 py-2 text-[13px] font-medium transition-colors",
              card.adopted
                ? "border-story bg-story text-white"
                : "border-rule-strong bg-canvas text-ink hover:border-story hover:text-story",
            ].join(" ")}
          >
            {card.adopted ? "✓ 채택됨" : "문장 채택"}
          </button>
        </footer>
      ) : null}
    </article>
  );
}

/*
 * 라벨과 내용이 붙어 있으면 둘이 한 덩어리로 읽혀 라벨이 제 역할을 못 한다.
 * 좁은 화면에서는 위아래로, 넓은 화면에서는 좌우로 — 어느 쪽이든 사이를 벌려 둔다.
 */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5 px-5 py-3.5 sm:grid-cols-[7rem_1fr] sm:gap-5">
      <p className="text-[12px] font-semibold tracking-wide text-ink-faint sm:pt-0.5">{label}</p>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
