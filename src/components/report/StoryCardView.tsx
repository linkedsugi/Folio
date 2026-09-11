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

export function StoryCardView({
  card,
  onAdopt,
}: {
  card: StoryCard;
  onAdopt?: (adopted: boolean) => void;
}) {
  return (
    <article className="rounded-sm border border-rule bg-canvas">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule bg-story-soft px-4 py-2.5">
        <h3 className="text-sm font-bold text-ink">{card.teamExpectation}</h3>
        <p className="tabular shrink-0 text-sm font-bold">
          <span className="text-now">{card.from}%</span>
          <span className="mx-1 text-ink-faint">→</span>
          <span className="text-story">{card.to}%</span>
        </p>
      </header>

      <div className="divide-y divide-rule">
        <Row label="활용할 내 경험">
          <p className="text-[13px]">{card.usedExperience}</p>
        </Row>

        <Row label="연결 논리">
          <p className="text-[13px] leading-relaxed">{card.connectionLogic}</p>
        </Row>

        {card.evidence.length > 0 ? (
          <Row label="실제 증거">
            <ul className="flex flex-wrap gap-1.5">
              {card.evidence.map((e, i) => (
                <li key={i} className="rounded-sm bg-surface-sunken px-1.5 py-0.5 text-[12px] text-ink-muted">
                  {e}
                </li>
              ))}
            </ul>
          </Row>
        ) : null}

        <Row label="이력서 문장">
          {/* 이 문장이 그대로 이력서 2 에 들어간다. 두 결과물의 문장이 일치해야 한다. (기획서 14) */}
          <blockquote className="border-l-2 border-story pl-2.5 text-[13px] leading-relaxed text-ink">
            “{card.resumeSentence}”
          </blockquote>
        </Row>

        <Row label="면접 설명">
          <p className="text-[13px] leading-relaxed text-ink-muted">“{card.interviewNote}”</p>
        </Row>

        <Row label="보완 범위와 한계">
          <p className="text-[13px] leading-relaxed text-warn">{card.scopeAndLimit}</p>
        </Row>
      </div>

      {onAdopt ? (
        <footer className="flex items-center justify-between gap-3 border-t border-rule bg-surface px-4 py-2.5">
          <p className="text-[11px] leading-snug text-ink-faint">
            채택하면 이력서 2에 이 문장이 들어갑니다.
          </p>
          <button
            type="button"
            onClick={() => onAdopt(!card.adopted)}
            aria-pressed={card.adopted}
            className={[
              "shrink-0 rounded-sm border px-2.5 py-1 text-[12px] font-medium transition-colors",
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 px-4 py-2.5 sm:grid-cols-[6.5rem_1fr] sm:gap-4">
      <p className="text-[11px] font-semibold tracking-wide text-ink-faint sm:pt-0.5">{label}</p>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
