/**
 * 이력서 판본 전환. (사용자 확정 파이프라인)
 *
 * 매칭 3단계와 이력서 3판본이 1:1로 대응하므로, 전환기에서 그 대응을 보여준다.
 * 미래(계획) 판본은 제출할 수 없다는 것을 전환 시점에 분명히 알린다.
 */
"use client";

import { RESUME_VARIANT_META, type ResumeSet, type ResumeVariant } from "@/lib/types";
import { STAGE_META } from "@/lib/scoring";

const VARIANTS: ResumeVariant[] = ["baseline", "story", "future"];

const TONE: Record<ResumeVariant, { on: string; off: string; dot: string }> = {
  baseline: {
    on: "border-now bg-now text-white",
    off: "border-rule-strong bg-canvas text-ink-muted hover:border-now hover:text-now",
    dot: "bg-now",
  },
  story: {
    on: "border-story bg-story text-white",
    off: "border-rule-strong bg-canvas text-ink-muted hover:border-story hover:text-story",
    dot: "bg-story",
  },
  future: {
    on: "border-goal bg-goal text-white",
    off: "border-rule-strong bg-canvas text-ink-muted hover:border-goal hover:text-goal",
    dot: "bg-goal",
  },
};

export function VariantSwitch({
  set,
  onSelect,
  onSubmitVariantChange,
}: {
  set: ResumeSet;
  onSelect: (v: ResumeVariant) => void;
  onSubmitVariantChange?: (v: Exclude<ResumeVariant, "future">) => void;
}) {
  const active = set.active;
  const meta = RESUME_VARIANT_META[active];

  return (
    <div className="space-y-3">
      <div
        role="tablist"
        aria-label="이력서 판본"
        className="grid grid-cols-3 gap-2"
      >
        {VARIANTS.map((v) => {
          const m = RESUME_VARIANT_META[v];
          const on = v === active;
          const doc = set[v];
          return (
            <button
              key={v}
              role="tab"
              aria-selected={on}
              type="button"
              onClick={() => onSelect(v)}
              className={`rounded-sm border px-3 py-3 text-left transition-colors ${on ? TONE[v].on : TONE[v].off}`}
            >
              <span className="block text-[12px] leading-tight font-semibold opacity-90">
                {m.title}
              </span>
              <span className="tabular mt-1 block text-lg leading-none font-bold">
                {doc.narrative.matchScore}%
              </span>
              <span className="mt-1 block text-[11px] leading-tight opacity-80">
                {STAGE_META[m.matchStage].title}
              </span>
            </button>
          );
        })}
      </div>

      <div
        className={[
          "rounded-sm border px-4 py-3 text-[13px] leading-relaxed",
          active === "future"
            ? "border-goal-rule bg-goal-soft text-goal"
            : "border-rule bg-surface text-ink-muted",
        ].join(" ")}
      >
        <p>
          <strong className="font-bold">{meta.subtitle}.</strong> {meta.note}
        </p>

        {meta.submittable && onSubmitVariantChange ? (
          <label className="mt-2.5 flex items-center gap-2 text-ink">
            <input
              type="radio"
              name="submit-variant"
              checked={set.submitVariant === active}
              onChange={() => onSubmitVariantChange(active as Exclude<ResumeVariant, "future">)}
              className="accent-[var(--color-ink)]"
            />
            <span className="font-medium">이 판본을 제출용으로 확정</span>
          </label>
        ) : null}
      </div>
    </div>
  );
}

/** 판본별 합격가능성 스토리텔링. 수치는 직무 매칭률이며 합격 확률이 아니다. */
export function NarrativePanel({ set }: { set: ResumeSet }) {
  const doc = set[set.active];
  const n = doc.narrative;
  const meta = RESUME_VARIANT_META[set.active];

  return (
    <section className="rounded-sm border border-rule bg-canvas">
      <header className="border-b border-rule px-5 py-3">
        <p className="text-[12px] font-semibold tracking-wide text-brand">
          이 판본을 냈을 때 — {STAGE_META[meta.matchStage].title} {n.matchScore}%
        </p>
        <p className="mt-1.5 text-[16px] leading-relaxed font-bold text-ink">{n.headline}</p>
      </header>
      <div className="divide-y divide-rule">
        <Row label="모집팀이 읽어낼 것">
          <ul className="space-y-1">
            {n.readsAs.map((s, i) => (
              <li key={i} className="text-[14px] leading-relaxed">
                · {s}
              </li>
            ))}
          </ul>
        </Row>
        <Row label="그래도 남는 차이">
          <ul className="space-y-1">
            {n.remainingGap.map((s, i) => (
              <li key={i} className="text-[14px] leading-relaxed text-warn">
                · {s}
              </li>
            ))}
          </ul>
        </Row>
        <Row label="면접에서">
          <p className="text-[14px] leading-relaxed text-ink-muted">{n.interviewAngle}</p>
        </Row>
        {n.caution ? (
          <div className="bg-goal-soft px-5 py-3 text-[13px] leading-relaxed text-goal">
            {n.caution}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5 px-5 py-3.5 sm:grid-cols-[7.5rem_1fr] sm:gap-5">
      <p className="text-[12px] font-semibold tracking-wide text-ink-faint sm:pt-0.5">{label}</p>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
