/**
 * 지원전략 분석서 전체 보기. (기획서 07)
 *
 * 첫 장은 한눈에 판단하는 요약, 다음 장은 그 판단을 이해하고 실행하는 상세 설명.
 *   1 한눈에 보는 요약   — 인재상 한 문장, 전체 3단계 매칭, 부문별 비교표, 필수 조건, 우선 행동
 *   2 인재상·매칭 근거   — JD 의 실제 조건, 각 부문의 이유, 관련 경험과 남는 차이
 *   3 경험 스토리        — 활용한 경험, 직무 연결 논리, 이력서 문장과 면접 설명
 *   4 실행·목표 계획     — 진행할 과제, 필요한 기회, 완료 증거, 부문별 목표와 재평가 기준
 *
 * 이 컴포넌트는 화면 열람과 인쇄(PDF)에 함께 쓴다. 인쇄에서는 편집 조작이 사라진다.
 */
import {
  PRIORITY_LABEL,
  type ApplicantProfile,
  type JobPosting,
  type StrategyReport,
} from "@/lib/types";
import { READING_NOTE, STAGE_META, weightSummary } from "@/lib/scoring";
import { IdealCandidateCard } from "./IdealCandidateCard";
import { VerdictPanel } from "./VerdictPanel";
import { StoryCardView } from "./StoryCardView";
import { ActionCardView } from "./ActionCardView";
import { DimensionDetail } from "./DimensionDetail";

export function ReportView({
  report,
  posting,
  profile,
  forPrint = false,
}: {
  report: StrategyReport;
  posting: JobPosting;
  profile: ApplicantProfile;
  forPrint?: boolean;
}) {
  const byPriority = [1, 2, 3].map(
    (p) => [p as 1 | 2 | 3, report.actions.filter((a) => a.priority === p)] as const,
  );

  return (
    <article className={forPrint ? "print-page mx-auto max-w-[210mm] bg-canvas" : "space-y-8"}>
      {/* ── 표지 겸 1 한눈에 보는 요약 ───────────────────────── */}
      <section className={forPrint ? "space-y-4" : "space-y-4"}>
        <header className="doc-rule pb-2">
          <p className="text-[11px] font-semibold tracking-wide text-brand">
            MINDCANVAS / ROLEFIT CANVAS
          </p>
          <h1 className="mt-1.5 text-xl leading-tight font-bold text-ink sm:text-2xl">
            지원전략 분석서
          </h1>
          <p className="mt-0.5 text-[13px] text-ink-muted">
            {posting.company}
            {posting.team ? ` · ${posting.team}` : ""} · {posting.roleTitle} — {profile.name}
          </p>
          <p className="mt-1 text-[11px] text-ink-faint">
            지원자 전용 자료입니다. 기본 비공개이며, 이 문서의 점수·부족한 부분·미래 계획은 기업
            제출용 이력서에 들어가지 않습니다.
          </p>
        </header>

        <h2 className="text-[15px] font-bold text-ink">1 한눈에 보는 요약</h2>

        <IdealCandidateCard
          ideal={report.idealCandidate}
          requirements={posting.requirements}
          compact
        />

        {/* 전체 3단계 매칭 */}
        <div className="grid grid-cols-3 gap-2">
          {(["current", "afterStory", "target"] as const).map((stage) => {
            const tone =
              stage === "current"
                ? "border-now-rule bg-now-soft text-now"
                : stage === "afterStory"
                  ? "border-story-rule bg-story-soft text-story"
                  : "border-goal-rule bg-goal-soft text-goal";
            return (
              <div key={stage} className={`avoid-break rounded-sm border px-3 py-2.5 ${tone}`}>
                <p className="text-[11px] font-semibold">{STAGE_META[stage].title}</p>
                <p className="tabular text-2xl leading-none font-bold sm:text-3xl">
                  {report.overall.display[stage]}%
                </p>
                <p className="mt-1 text-[10px] leading-snug opacity-90">
                  {STAGE_META[stage].caption}
                </p>
              </div>
            );
          })}
        </div>

        {/* 부문별 비교표 */}
        <SummaryTable report={report} />

        <VerdictPanel
          verdict={report.verdict}
          note={report.verdictNote}
          mustHave={report.mustHaveStatus}
        />

        {/* 우선 행동 */}
        <div className="avoid-break rounded-sm border border-rule bg-canvas px-4 py-3">
          <h3 className="text-[13px] font-bold text-ink">먼저 할 일</h3>
          <ol className="mt-1.5 space-y-1.5">
            {byPriority.map(([p, items]) =>
              items.length === 0 ? null : (
                <li key={p} className="text-[12px] leading-snug">
                  <span className="font-bold text-ink">
                    {p} {PRIORITY_LABEL[p]}
                  </span>
                  <span className="ml-1.5 text-ink-muted">
                    {items.map((a) => a.gap).join(" · ")}
                  </span>
                </li>
              ),
            )}
          </ol>
        </div>

        <p className="text-[11px] leading-relaxed text-ink-faint">읽는 법: {READING_NOTE}</p>
      </section>

      {/* ── 2 인재상·매칭 근거 ───────────────────────── */}
      <section className={forPrint ? "page-break space-y-3 pt-6" : "space-y-3"}>
        <div>
          <h2 className="text-[15px] font-bold text-ink">2 인재상·매칭 근거</h2>
          <p className="text-[12px] text-ink-muted">
            왜 이런 인재상과 점수가 나왔는지, 공고의 실제 문구와 함께 확인합니다.
          </p>
        </div>
        <IdealCandidateCard ideal={report.idealCandidate} requirements={posting.requirements} />
        <div className="space-y-3">
          {report.dimensions.map((d) => (
            <DimensionDetail key={d.id} dimension={d} experiences={profile.experiences} />
          ))}
        </div>
        <p className="text-[11px] leading-relaxed text-ink-faint">
          {weightSummary(report.dimensions, report.overall)}
        </p>
      </section>

      {/* ── 3 경험 스토리 ───────────────────────── */}
      {report.stories.length > 0 ? (
        <section className={forPrint ? "page-break space-y-3 pt-6" : "space-y-3"}>
          <div>
            <h2 className="text-[15px] font-bold text-ink">3 경험 스토리</h2>
            <p className="text-[12px] text-ink-muted">
              새 경험을 만들어 넣는 것이 아니라, 실제 경험 속에서 이 직무와 연결되는 의미와 증거를
              찾습니다.
            </p>
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            {report.stories.map((s) => (
              <StoryCardView key={s.id} card={s} />
            ))}
          </div>
        </section>
      ) : null}

      {/* ── 4 실행·목표 계획 ───────────────────────── */}
      {report.actions.length > 0 ? (
        <section className={forPrint ? "page-break space-y-3 pt-6" : "space-y-3"}>
          <div>
            <h2 className="text-[15px] font-bold text-ink">4 실행·목표 계획</h2>
            <p className="text-[12px] text-ink-muted">
              계획 기간은 현재 수준·가용 시간·실무 기회를 확인한 뒤 정합니다. 실무 기회가 없으면
              먼저 개인 프로젝트나 협업 과제로 준비하되, 상용 경험을 대신 충족했다고 표시하지
              않습니다.
            </p>
          </div>
          {byPriority.map(([p, items]) =>
            items.length === 0 ? null : (
              <div key={p} className="space-y-2">
                <h3 className="text-[13px] font-bold text-ink">
                  {p} {PRIORITY_LABEL[p]}
                </h3>
                <div className="grid gap-3 xl:grid-cols-2">
                  {items.map((a) => (
                    <ActionCardView key={a.id} card={a} />
                  ))}
                </div>
              </div>
            ),
          )}
        </section>
      ) : null}

      <footer className="border-t border-rule pt-3 text-[10px] leading-relaxed text-ink-faint">
        <p>
          수치는 합격확률이 아닌 직무 매칭률입니다. 전체 목표에 도달해도 필수 조건 충족을 뜻하지
          않으며, 100%에 도달해야만 지원할 수 있는 것도 아닙니다. 예정된 학위·자격·교육·프로젝트는
          완료된 이력서 항목으로 넣지 않습니다.
        </p>
      </footer>
    </article>
  );
}

/**
 * 부문별 비교표 — 인쇄에서도 읽히도록 표 하나로 압축한다.
 * 화면의 MatchTable 은 상호작용(행 선택)이 있고, 이쪽은 읽기 전용이다.
 */
function SummaryTable({ report }: { report: StrategyReport }) {
  return (
    <div className="avoid-break overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-left">
        <thead>
          <tr className="bg-ink text-white">
            <th scope="col" className="px-2.5 py-1.5 text-[11px] font-semibold">
              모집팀의 기대
            </th>
            <th scope="col" className="px-2 py-1.5 text-center text-[11px] font-semibold">
              비중
            </th>
            <th scope="col" className="px-2 py-1.5 text-center text-[11px] font-semibold">
              현재
            </th>
            <th scope="col" className="px-2 py-1.5 text-center text-[11px] font-semibold">
              스토리 후
            </th>
            <th scope="col" className="px-2 py-1.5 text-center text-[11px] font-semibold">
              목표
            </th>
            <th scope="col" className="px-2.5 py-1.5 text-[11px] font-semibold">
              남는 차이
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-rule">
          {report.dimensions.map((d) => (
            <tr key={d.id} className="align-top odd:bg-canvas even:bg-surface">
              <td className="px-2.5 py-1.5 text-[12px] font-medium text-ink">
                {d.label}
                {d.kind === "must" ? (
                  <span className="ml-1 text-[10px] text-ink-muted">[필수]</span>
                ) : d.kind === "preferred" ? (
                  <span className="ml-1 text-[10px] text-ink-faint">[우대]</span>
                ) : null}
              </td>
              <td className="tabular px-2 py-1.5 text-center text-[12px] text-ink-faint">
                {d.weight}%
              </td>
              <td className="tabular bg-now-soft px-2 py-1.5 text-center text-[12px] font-semibold text-now">
                {d.current}%
              </td>
              <td className="tabular bg-story-soft px-2 py-1.5 text-center text-[12px] font-semibold text-story">
                {d.afterStory}%
              </td>
              <td className="tabular bg-goal-soft px-2 py-1.5 text-center text-[12px] font-semibold text-goal">
                {d.target}%
              </td>
              <td className="px-2.5 py-1.5 text-[11px] leading-snug text-ink-muted">
                {d.remainingGap}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
