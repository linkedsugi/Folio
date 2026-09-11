/**
 * 부문 상세. (기획서 04)
 *
 * 부문별 점수를 누르면 "팀의 기대 / 반영한 내 경험 / 점수의 이유 / 남는 차이"를 보여준다.
 * 전체는 부문 중요도를 반영한 값이며, 회사의 내부 배점이라고 설명하지 않는다.
 */
import type { ExperienceItem, MatchDimension } from "@/lib/types";
import { STAGE_META } from "@/lib/scoring";

export function DimensionDetail({
  dimension,
  experiences,
}: {
  dimension: MatchDimension;
  experiences: ExperienceItem[];
}) {
  const used = experiences.filter((e) => dimension.usedExperienceIds.includes(e.id));

  return (
    <div className="rounded-sm border border-rule bg-canvas">
      <header className="border-b border-rule px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-bold text-ink">
            {dimension.label}
            {dimension.kind === "must" ? (
              <span className="ml-1.5 text-[11px] font-semibold text-ink-muted">[필수]</span>
            ) : dimension.kind === "preferred" ? (
              <span className="ml-1.5 text-[11px] font-semibold text-ink-faint">[우대]</span>
            ) : null}
          </h3>
          <p className="text-[11px] text-ink-faint">부문 비중 {dimension.weight}%</p>
        </div>

        <dl className="mt-2.5 grid grid-cols-3 gap-2">
          {(["current", "afterStory", "target"] as const).map((stage) => {
            const tone =
              stage === "current"
                ? "bg-now-soft text-now"
                : stage === "afterStory"
                  ? "bg-story-soft text-story"
                  : "bg-goal-soft text-goal";
            return (
              <div key={stage} className={`rounded-sm px-2 py-1.5 ${tone}`}>
                <dt className="text-[10px] leading-tight font-semibold opacity-80">
                  {STAGE_META[stage].title}
                </dt>
                <dd className="tabular text-lg leading-tight font-bold">{dimension[stage]}%</dd>
              </div>
            );
          })}
        </dl>
      </header>

      <div className="divide-y divide-rule">
        <Row label="팀의 기대">{dimension.teamExpectation}</Row>
        <Row label="반영한 내 경험">
          <p>{dimension.storyBasis || dimension.currentBasis}</p>
          {used.length > 0 ? (
            <ul className="mt-1.5 space-y-1">
              {used.map((e) => (
                <li key={e.id} className="rounded-sm bg-surface px-2 py-1 text-[12px]">
                  <span className="font-medium text-ink">{e.organization}</span>
                  <span className="mx-1 text-ink-faint">·</span>
                  <span className="text-ink-muted">{e.title}</span>
                  {e.ownRole ? (
                    <span className="block text-ink-faint">본인 역할: {e.ownRole}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </Row>

        <Row label="점수의 이유">
          <p>{dimension.currentBasis}</p>
          {dimension.rationale.length > 0 ? (
            <details className="mt-1.5">
              <summary className="cursor-pointer list-none text-[12px] font-medium text-brand hover:underline">
                왜 이렇게 해석했나요?
              </summary>
              <ol className="mt-1.5 space-y-2">
                {dimension.rationale.map((r, i) => (
                  <li key={i} className="border-l-2 border-rule pl-2.5">
                    <p className="text-[12px] font-medium text-ink">{r.claim}</p>
                    {r.evidence.map((e, j) => (
                      <blockquote key={j} className="mt-0.5 bg-surface px-2 py-1 text-[12px] italic">
                        “{e.quote}”
                      </blockquote>
                    ))}
                    <p className="mt-0.5 text-[12px] text-ink-muted">{r.interpretation}</p>
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
        </Row>

        <Row label="남는 차이">
          <p className="text-warn">{dimension.remainingGap}</p>
          {dimension.targetCaveat ? (
            <p className="mt-1 rounded-sm bg-warn-soft px-2 py-1 text-[12px] text-warn">
              {dimension.targetCaveat}
            </p>
          ) : null}
        </Row>

        <Row label="이후 진행 → 완료 증거">
          <p>{dimension.nextStep}</p>
          <p className="mt-0.5 text-ink-muted">→ {dimension.evidenceToProduce}</p>
        </Row>

        {dimension.confidence === "needs-confirmation" ? (
          <div className="bg-warn-soft px-4 py-2.5 text-[12px] leading-snug text-warn">
            정보가 부족해 <strong>확인 필요</strong>로 남겨 둔 항목입니다. 관련 경험을 추가하면 다시
            평가합니다.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 px-4 py-2.5 sm:grid-cols-[7rem_1fr] sm:gap-4">
      <p className="text-[11px] font-semibold tracking-wide text-ink-faint sm:pt-0.5">{label}</p>
      <div className="min-w-0 text-[13px] leading-relaxed">{children}</div>
    </div>
  );
}
