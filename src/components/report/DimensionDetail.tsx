/**
 * 부문 상세. (기획서 04)
 *
 * 부문별 점수를 누르면 "팀의 기대 / 반영한 내 경험 / 점수의 이유 / 남는 차이"를 보여준다.
 * 전체는 부문 중요도를 반영한 값이며, 회사의 내부 배점이라고 설명하지 않는다.
 */
import {
  STORY_LIFT_LABEL,
  STORY_LIFT_NOTE,
  type ActionCard,
  type ExperienceItem,
  type MatchDimension,
  type StoryCard,
} from "@/lib/types";
import { STAGE_META } from "@/lib/scoring";
import { RefinedMark } from "./RefinedMark";
import type { RefinedLookup } from "./refined";

/**
 * 부문 하나를 누르면 끝까지 이어져야 한다:
 *   점수의 이유 → 활용한 경험 → 이력서 2의 문장 → 개선 과제 → 이력서 3의 목표 문장
 * 그래서 이 부문에 연결된 스토리 카드와 실행 카드를 함께 받는다.
 */
export function DimensionDetail({
  dimension,
  experiences,
  stories = [],
  actions = [],
  refined,
}: {
  dimension: MatchDimension;
  experiences: ExperienceItem[];
  stories?: StoryCard[];
  actions?: ActionCard[];
  /** 정밀 분석이 다듬은 자리 조회. 넘기지 않으면 표식이 하나도 뜨지 않는다. */
  refined?: RefinedLookup;
}) {
  const used = experiences.filter((e) => dimension.usedExperienceIds.includes(e.id));
  const story = stories.find((s) => s.dimensionId === dimension.id);
  const dimActions = actions.filter((a) => a.dimensionId === dimension.id);

  return (
    <div className="rounded-sm border border-rule bg-canvas">
      <header className="border-b border-rule px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="text-[15px] font-bold text-ink">
            {dimension.label}
            {dimension.kind === "must" ? (
              <span className="ml-2 text-[12px] font-semibold text-ink-muted">[필수]</span>
            ) : dimension.kind === "preferred" ? (
              <span className="ml-2 text-[12px] font-semibold text-ink-faint">[우대]</span>
            ) : null}
          </h3>
          <p className="text-[12px] text-ink-faint">부문 비중 {dimension.weight}%</p>
        </div>

        <dl className="mt-3.5 grid grid-cols-3 gap-2.5">
          {(["current", "afterStory", "target"] as const).map((stage) => {
            const tone =
              stage === "current"
                ? "bg-now-soft text-now"
                : stage === "afterStory"
                  ? "bg-story-soft text-story"
                  : "bg-goal-soft text-goal";
            return (
              <div key={stage} className={`rounded-sm px-3 py-2 ${tone}`}>
                <dt className="text-[11px] leading-tight font-semibold opacity-80">
                  {STAGE_META[stage].title}
                </dt>
                <dd className="tabular mt-0.5 text-lg leading-tight font-bold">
                  {dimension[stage]}%
                </dd>
              </div>
            );
          })}
        </dl>
      </header>

      <div className="divide-y divide-rule">
        <Row label="팀의 기대">{dimension.teamExpectation}</Row>
        <Row label="반영한 내 경험">
          <p>
            {dimension.storyBasis || dimension.currentBasis}
            {/* 화면에 실제로 그린 쪽의 출처를 밝힌다. 고르지 않은 문장의 표식을 빌려오면 거짓이 된다. */}
            <RefinedMark
              refined={refined?.(
                dimension.storyBasis
                  ? `dimension:${dimension.id}:storyBasis`
                  : `dimension:${dimension.id}:currentBasis`,
              )}
            />
          </p>
          {used.length > 0 ? (
            <ul className="mt-2.5 space-y-1.5">
              {used.map((e) => (
                <li key={e.id} className="rounded-sm bg-surface px-3 py-2 text-[13px]">
                  <span className="font-medium text-ink">{e.organization}</span>
                  <span className="mx-1.5 text-ink-faint">·</span>
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
          <p>
            {dimension.currentBasis}
            <RefinedMark refined={refined?.(`dimension:${dimension.id}:currentBasis`)} />
          </p>
          {dimension.rationale.length > 0 ? (
            <details className="mt-2.5">
              <summary className="cursor-pointer list-none text-[13px] font-medium text-brand hover:underline">
                왜 이렇게 해석했나요?
              </summary>
              <ol className="mt-2.5 space-y-3">
                {dimension.rationale.map((r, i) => (
                  <li key={i} className="border-l-2 border-rule pl-3.5">
                    <p className="text-[13px] font-medium text-ink">{r.claim}</p>
                    {r.evidence.map((e, j) => (
                      <blockquote key={j} className="mt-1 bg-surface px-3 py-2 text-[13px] italic">
                        “{e.quote}”
                      </blockquote>
                    ))}
                    <p className="mt-1 text-[13px] text-ink-muted">{r.interpretation}</p>
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
        </Row>

        {/*
          "표현의 개선"과 "경험 자체의 개선"을 구분해 준다.
          값이 그대로인 것이 앱이 일을 안 한 것처럼 보이면 안 된다.
        */}
        <Row label="스토리텔링에서">
          <p className="font-medium text-ink">{STORY_LIFT_LABEL[dimension.storyLift]}</p>
          <p className="mt-1 text-ink-muted">{STORY_LIFT_NOTE[dimension.storyLift]}</p>
          {dimension.storyBasis ? (
            <p className="mt-1.5 text-ink-muted">
              {dimension.storyBasis}
              <RefinedMark refined={refined?.(`dimension:${dimension.id}:storyBasis`)} />
            </p>
          ) : null}
        </Row>

        {story ? (
          <Row label="이력서 2의 문장">
            {/* 분석서에서 채택한 경험과 실제 이력서의 문장이 일치해야 한다. (기획서 14) */}
            <blockquote className="border-l-2 border-story pl-3.5 leading-relaxed">
              “{story.resumeSentence}”
              <RefinedMark refined={refined?.(`story:${story.id}:resumeSentence`)} />
            </blockquote>
            <p className="mt-1.5 text-[13px] text-ink-muted">
              면접에서: “{story.interviewNote}”
              <RefinedMark refined={refined?.(`story:${story.id}:interviewNote`)} />
            </p>
          </Row>
        ) : null}

        <Row label="남는 차이">
          <p className="text-warn">
            {dimension.remainingGap}
            <RefinedMark refined={refined?.(`dimension:${dimension.id}:remainingGap`)} />
          </p>
          {dimension.targetCaveat ? (
            <p className="mt-2 rounded-sm bg-warn-soft px-3 py-2 text-[13px] text-warn">
              {dimension.targetCaveat}
            </p>
          ) : null}
        </Row>

        <Row label="이후 진행 → 완료 증거">
          <p>{dimension.nextStep}</p>
          <p className="mt-1 text-ink-muted">→ {dimension.evidenceToProduce}</p>
        </Row>

        {dimActions.length > 0 ? (
          <Row label="이력서 3의 목표 문장">
            {/* 개선 과제는 이 문장에서 거꾸로 설계된다. */}
            <ul className="space-y-3">
              {dimActions.map((a) => (
                <li key={a.id}>
                  <blockquote className="border-l-2 border-goal bg-goal-soft px-3 py-2 leading-relaxed">
                    “{a.targetSentence}”
                  </blockquote>
                  <p className="mt-1 text-[13px] text-ink-muted">
                    사실로 만들려면: {a.experienceNeeded}
                  </p>
                </li>
              ))}
            </ul>
          </Row>
        ) : null}

        {dimension.confidence === "needs-confirmation" ? (
          <div className="bg-warn-soft px-5 py-3 text-[13px] leading-snug text-warn">
            정보가 부족해 <strong>확인 필요</strong>로 남겨 둔 항목입니다. 관련 경험을 추가하면 다시
            평가합니다.
          </div>
        ) : null}
      </div>
    </div>
  );
}

/*
 * 라벨-내용 2단 구조. 라벨이 내용에 붙어 있으면 어느 쪽이 답인지 눈이 먼저 헤맨다.
 * 좁은 화면에서는 위아래, 넓은 화면에서는 좌우로 벌린다.
 */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5 px-5 py-3.5 sm:grid-cols-[7.5rem_1fr] sm:gap-5">
      <p className="text-[12px] font-semibold tracking-wide text-ink-faint sm:pt-0.5">{label}</p>
      <div className="min-w-0 text-[14px] leading-relaxed">{children}</div>
    </div>
  );
}
