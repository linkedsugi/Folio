/**
 * 3·4·5 매핑 단계. (기획서 03·04·05·06 + 사용자 확정 파이프라인)
 *
 * 세 단계가 같은 구조를 쓴다 — 무엇을 강조하고 무엇을 보여주는지만 다르다.
 *
 *   baseline  직접 매핑        현재 매칭률 강조   · 이력서 1
 *   story     스토리텔링 매핑   스토리 후 강조    · 이력서 2  + 스토리 카드
 *   plan      개선 과제·목표    목표 강조        · 이력서 3  + 실행 카드
 *
 * 화면을 셋으로 나눈 이유: 한 화면에 3단계를 모두 펼치면 "지금 보고 있는 결과"가
 * 무엇인지 흐려진다. 기획서 10 은 사용자가 보고 있는 결과와 다음 행동이 항상
 * 분명해야 한다고 요구한다.
 */
"use client";

import { useMemo, useState } from "react";
import {
  RESUME_VARIANT_META,
  type ActionCard,
  type ApplicantProfile,
  type JobPosting,
  type ResumeSet,
  type ResumeVariant,
  type StoryCard,
  type StrategyReport,
} from "@/lib/types";
import { READING_NOTE, STAGE_META, weightSummary } from "@/lib/scoring";
import { MatchTable, ScoreTriad } from "@/components/ui";
import { DimensionDetail } from "@/components/report/DimensionDetail";
import { StoryCardView } from "@/components/report/StoryCardView";
import { ActionCardView } from "@/components/report/ActionCardView";
import { VerdictPanel } from "@/components/report/VerdictPanel";
import { CandidacyPanel } from "@/components/report/CandidacyPanel";
import { ResumeDocumentView } from "@/components/resume/ResumeDocumentView";
import { NarrativePanel } from "@/components/resume/VariantSwitch";

type MappingStage = "baseline" | "story" | "plan";

const STAGE_TO_VARIANT: Record<MappingStage, ResumeVariant> = {
  baseline: "baseline",
  story: "story",
  plan: "future",
};

const HEAD: Record<MappingStage, { eyebrow: string; title: string; lead: string }> = {
  baseline: {
    eyebrow: "03 / BASELINE MATCH",
    title: "직접 수행한 것만으로는 어디까지 설명되나요?",
    lead: "공고의 요구 조건과, 그 일을 실제로 해 본 경험만 맞춰 본 결과입니다. 여기가 출발점입니다.",
  },
  story: {
    eyebrow: "04 / STORYTELLING MATCH",
    title: "이미 가진 경험으로 어디까지 설명할까요?",
    lead: "새 경험을 만들어 넣는 것이 아니라, 실제 경험 속에서 이 직무와 연결되는 의미와 증거를 찾습니다.",
  },
  plan: {
    eyebrow: "05 / NEXT ACTION & TARGET",
    title: "남는 차이는 과제와 목표로 바꿉니다",
    lead: "“더 공부하세요” 대신, 무엇을 하고 무엇을 보여주면 다시 평가할 수 있는지 제시합니다.",
  },
};

export interface MappingScreenProps {
  stage: MappingStage;
  posting: JobPosting;
  profile: ApplicantProfile;
  report: StrategyReport;
  resumes: ResumeSet;
  onAdoptStory?: (storyId: string, adopted: boolean) => void;
  onActionStatus?: (id: string, status: ActionCard["status"], evidence?: string) => void;
  onSaveActionToPlan?: (id: string, saved: boolean) => void;
  onReassess?: () => void;
  /** 재평가에서 반영하지 않은 과제와 그 이유 */
  reassessIgnored?: { actionId: string; reason: string }[];
  onNext: () => void;
  nextLabel: string;
}

export function MappingScreen({
  stage,
  posting,
  profile,
  report,
  resumes,
  onAdoptStory,
  onActionStatus,
  onSaveActionToPlan,
  onReassess,
  reassessIgnored,
  onNext,
  nextLabel,
}: MappingScreenProps) {
  const head = HEAD[stage];
  const variant = STAGE_TO_VARIANT[stage];
  const activeStage = RESUME_VARIANT_META[variant].matchStage;
  const [selected, setSelected] = useState<string | null>(null);
  const [showResume, setShowResume] = useState(false);

  const selectedDimension = useMemo(
    () => report.dimensions.find((d) => d.id === selected) ?? null,
    [report.dimensions, selected],
  );

  // 이 단계에서 실제로 변화가 일어난 부문만 아래 카드로 보여준다.
  const movedStories: StoryCard[] = useMemo(
    () => (stage === "story" ? report.stories : []),
    [report.stories, stage],
  );
  const openActions: ActionCard[] = useMemo(
    () => (stage === "plan" ? [...report.actions].sort((a, b) => a.priority - b.priority) : []),
    [report.actions, stage],
  );

  const doc = resumes[variant];

  return (
    // space-y-10: 이 화면에는 인재상·수치·부문표·설득 논리·스토리·결과물이 모두 올라온다.
    // 구역 사이가 가까우면 하나의 긴 표로 읽혀 "지금 보고 있는 결과"가 무엇인지 흐려진다.
    <div className="space-y-10">
      <header>
        <p className="text-[12px] font-semibold tracking-wide text-brand">{head.eyebrow}</p>
        <h1 className="mt-1.5 text-xl leading-tight font-bold text-ink sm:text-2xl">{head.title}</h1>
        <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-ink-muted">{head.lead}</p>
      </header>

      {/* 상단: 모집팀이 원하는 사람 한 문장 */}
      <div className="rounded-sm border border-rule bg-canvas px-5 py-5 shadow-card sm:px-6 sm:py-6">
        <p className="text-[12px] font-semibold tracking-wide text-brand">모집팀의 인재상</p>
        <p className="mt-2 text-[17px] leading-relaxed font-bold text-ink">
          {report.idealCandidate.oneLine}
        </p>
        {/*
          조건을 한 줄에 모두 이어 붙이면 회색 덩어리가 되어 아무도 읽지 않는다.
          여기서는 개수만 알리고, 실제 조건은 아래 표에서 부문별로 본다.
        */}
        <p className="mt-3 text-[12px] leading-relaxed text-ink-faint">
          {posting.company}
          {posting.team ? ` · ${posting.team}` : ""} · {posting.roleTitle} · 필수{" "}
          {posting.requirements.filter((r) => r.kind === "must").length}개 · 우대{" "}
          {posting.requirements.filter((r) => r.kind === "preferred").length}개
        </p>
      </div>

      {/* 중단: 현재 → 스토리텔링 후 → 목표, 전체 수치 3개 */}
      <ScoreTriad overall={report.overall} active={activeStage} />

      {/* 하단: 부문별 변화·활용할 경험·이후 과제·목표를 나란히 비교 */}
      <section>
        <h2 className="mb-4 text-lg font-bold text-ink">부문별 비교</h2>
        <MatchTable
          dimensions={report.dimensions}
          onSelect={(id) => setSelected(id === selected ? null : id)}
          selectedId={selected}
          emphasize={activeStage}
        />
        <p className="mt-3 text-[12px] leading-relaxed text-ink-faint">
          부문별 점수를 누르면 “팀의 기대 / 반영한 내 경험 / 점수의 이유 / 남는 차이”를 보여줍니다.
          전체는 부문 중요도를 반영한 값이며, 회사의 내부 배점이 아닙니다.
        </p>
      </section>

      {selectedDimension ? (
        <DimensionDetail
          dimension={selectedDimension}
          experiences={profile.experiences}
          stories={report.stories}
          actions={report.actions}
        />
      ) : null}

      {stage === "baseline" ? (
        <VerdictPanel
          verdict={report.verdict}
          note={report.verdictNote}
          mustHave={report.mustHaveStatus}
        />
      ) : null}

      {stage === "story" ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-ink">이 팀이 지금 나를 검토할 이유</h2>
            <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-ink-muted">
              매칭률은 요구사항과의 대응 정도이고, 아래는 강점·우려·전제 조건에 대한 판단입니다.
              이력서 3을 완성할 때까지 지원을 미룰 필요는 없습니다.
            </p>
          </div>
          <CandidacyPanel candidacy={report.candidacyNow} profile={profile} />
        </section>
      ) : null}

      {stage === "plan" ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-ink">과제를 마쳤다면 어떤 지원자가 되는가</h2>
            <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-ink-muted">
              아래 문장들이 사실이 되었을 때의 설명입니다. 지금 면접에서 완료된 경험처럼 말하면
              안 됩니다.
            </p>
          </div>
          <CandidacyPanel candidacy={report.candidacyFuture} profile={profile} />
        </section>
      ) : null}

      {stage === "story" && movedStories.length > 0 ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-ink">한 항목은 하나의 이야기로</h2>
            <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-ink-muted">
              팀의 기대 → 활용할 내 경험 → 이 직무와의 공통점 → 실제 증거 → 이력서 문장·면접 답변 →
              여전히 남는 차이
            </p>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {movedStories.map((s) => (
              <StoryCardView
                key={s.id}
                card={s}
                onAdopt={onAdoptStory ? (a) => onAdoptStory(s.id, a) : undefined}
              />
            ))}
          </div>
        </section>
      ) : null}

      {stage === "plan" && openActions.length > 0 ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-ink">실행 순서</h2>
              <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-ink-muted">
                1 지금 정리하기 → 2 새 결과물 만들기 → 3 실무 책임 쌓기
              </p>
            </div>
            {onReassess ? (
              <button
                type="button"
                onClick={onReassess}
                className="rounded-sm border border-rule-strong bg-canvas px-3.5 py-2 text-[13px] font-medium text-ink hover:border-ink"
              >
                새 근거로 재평가
              </button>
            ) : null}
          </div>

          {reassessIgnored && reassessIgnored.length > 0 ? (
            <div className="rounded-sm border border-warn-soft bg-warn-soft px-4 py-3.5">
              <p className="text-[13px] font-bold text-warn">재평가에 반영하지 않은 과제</p>
              <ul className="mt-2 space-y-1">
                {reassessIgnored.map((i) => (
                  <li key={i.actionId} className="text-[13px] text-warn">
                    · {i.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-2">
            {openActions.map((a) => (
              <ActionCardView
                key={a.id}
                card={a}
                onStatusChange={
                  onActionStatus ? (s, ev) => onActionStatus(a.id, s, ev) : undefined
                }
                onSaveToPlan={onSaveActionToPlan ? (s) => onSaveActionToPlan(a.id, s) : undefined}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* 이 단계의 결과물 — 이력서 판본 */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[12px] font-semibold tracking-wide text-brand">이 단계의 결과물</p>
            <h2 className="mt-1 text-lg font-bold text-ink">
              {RESUME_VARIANT_META[variant].title}
              <span className="ml-2 text-[13px] font-normal text-ink-muted">
                {STAGE_META[activeStage].title} {doc.narrative.matchScore}%
              </span>
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShowResume((v) => !v)}
            className="rounded-sm border border-rule-strong bg-canvas px-3.5 py-2 text-[13px] font-medium text-ink hover:border-ink"
          >
            {showResume ? "지면 접기" : "지면 미리보기"}
          </button>
        </div>

        <NarrativePanel set={{ ...resumes, active: variant }} />

        {showResume ? (
          <div className="overflow-x-auto rounded-sm bg-surface-sunken p-4">
            <ResumeDocumentView doc={doc} />
          </div>
        ) : null}
      </section>

      <footer className="space-y-4 border-t border-rule pt-6">
        <p className="text-[12px] leading-relaxed text-ink-faint">읽는 법: {READING_NOTE}</p>
        <p className="text-[12px] leading-relaxed text-ink-faint">
          {weightSummary(report.dimensions, report.overall)}
        </p>
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onNext}
            className="w-full rounded-sm bg-ink px-6 py-3.5 text-[16px] font-bold text-white shadow-card transition-shadow hover:shadow-raised sm:w-auto"
          >
            {nextLabel}
          </button>
        </div>
      </footer>
    </div>
  );
}
