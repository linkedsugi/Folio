/**
 * 2 분석 확인 · 보강. (기획서 02·03·05)
 *
 * 공고에서 뽑아낸 인재상·조건과, 이력에서 정리한 경험을 사용자가 확인한다.
 * 앱이 틀렸을 수 있다는 전제로 만든다 — 추출 결과를 고칠 수 있어야 하고,
 * 확인이 더 필요한 부분을 숨기지 않아야 한다.
 *
 * 추가 질문에는 "답하기 / 자료 추가 / 아직 모름 / 건너뛰기"를 준다. (기획서 10)
 */
"use client";

import { useState } from "react";
import {
  EXPERIENCE_KIND_LABEL,
  PUBLICATION_STATUS_LABEL,
  type ApplicantProfile,
  type EnrichmentQuestion,
  type ExperienceItem,
  type JobPosting,
  type ReviewFlag,
} from "@/lib/types";
import { IdealCandidateCard } from "@/components/report/IdealCandidateCard";

export interface ReviewScreenProps {
  posting: JobPosting;
  profile: ApplicantProfile;
  questions: EnrichmentQuestion[];
  onAnswer: (
    id: string,
    state: EnrichmentQuestion["answerState"],
    answer?: string,
  ) => void;
  onResolveFlag: (scope: "posting" | "profile", flagId: string) => void;
  onAddExperience: (text: string) => void;
  onNext: () => void;
}

export function ReviewScreen({
  posting,
  profile,
  questions,
  onAnswer,
  onResolveFlag,
  onAddExperience,
  onNext,
}: ReviewScreenProps) {
  const openFlags = [
    ...posting.reviewFlags.filter((f) => !f.resolved).map((f) => ({ scope: "posting" as const, f })),
    ...profile.reviewFlags.filter((f) => !f.resolved).map((f) => ({ scope: "profile" as const, f })),
  ];
  const answered = questions.filter((q) => q.answerState !== "unanswered").length;

  return (
    <div className="space-y-8">
      {openFlags.length > 0 ? (
        <section className="rounded-sm border border-warn-soft bg-warn-soft px-5 py-4">
          <h2 className="text-[16px] font-bold text-warn">확인이 더 필요한 부분</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-warn">
            자료에 없는 것은 지어내지 않고 이렇게 남겨 둡니다. 확인하면 분석이 정확해집니다.
          </p>
          <ul className="mt-3 space-y-2">
            {openFlags.map(({ scope, f }) => (
              <FlagRow key={f.id} flag={f} onResolve={() => onResolveFlag(scope, f.id)} />
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <SectionTitle n="2-1" title="공고에서 읽은 것" />
          <div className="rounded-sm border border-rule bg-canvas px-5 py-4">
            <dl className="grid gap-x-4 gap-y-1.5 text-[14px] sm:grid-cols-[5rem_1fr]">
              <dt className="text-[12px] font-semibold text-ink-faint">회사·팀</dt>
              <dd className="font-medium text-ink">
                {posting.company}
                {posting.team ? ` · ${posting.team}` : ""}
              </dd>
              <dt className="text-[12px] font-semibold text-ink-faint">직무</dt>
              <dd className="font-medium text-ink">{posting.roleTitle}</dd>
              {posting.documentRules?.note ? (
                <>
                  <dt className="text-[12px] font-semibold text-ink-faint">문서 조건</dt>
                  <dd className="text-warn">{posting.documentRules.note}</dd>
                </>
              ) : null}
            </dl>
            {posting.responsibilities.length > 0 ? (
              <div className="mt-3">
                <p className="text-[12px] font-semibold text-ink-faint">주요 업무</p>
                <ul className="mt-1 space-y-0.5">
                  {posting.responsibilities.map((r, i) => (
                    <li key={i} className="text-[14px]">
                      · {r}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <IdealCandidateCard ideal={posting.idealCandidate} requirements={posting.requirements} />
        </div>

        <div className="space-y-4">
          <SectionTitle n="2-2" title="내 이력에서 정리한 것" />
          <ProfileSummary profile={profile} onAddExperience={onAddExperience} />
        </div>
      </div>

      {questions.length > 0 ? (
        <section className="space-y-4">
          <SectionTitle
            n="2-3"
            title="핵심 추가 질문"
            lead="부족한 항목에 맞춘 질문입니다. 모르면 모른다고 답해도 됩니다."
            meta={`${answered}/${questions.length} 응답`}
          />
          <ul className="space-y-4">
            {questions.map((q) => (
              <QuestionCard key={q.id} q={q} onAnswer={onAnswer} />
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-sm border border-rule bg-canvas px-5 py-5 shadow-card">
        <p className="text-[13px] leading-relaxed text-ink-muted">
          확인이 끝나면 요구 조건과 내 경험을 직접 맞춰 봅니다.
        </p>
        <button
          type="button"
          onClick={onNext}
          className="w-full shrink-0 rounded-sm bg-ink px-6 py-3.5 text-[16px] font-bold text-white shadow-card transition-shadow hover:shadow-raised sm:w-auto"
        >
          현재 매핑 보기
        </button>
      </div>
    </div>
  );
}

function SectionTitle({
  n,
  title,
  lead,
  meta,
}: {
  n: string;
  title: string;
  lead?: string;
  meta?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <div>
        <p className="text-[12px] font-semibold tracking-wide text-brand">{n}</p>
        <h2 className="mt-0.5 text-lg font-bold text-ink">{title}</h2>
        {lead ? <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{lead}</p> : null}
      </div>
      {meta ? <p className="tabular text-[12px] text-ink-faint">{meta}</p> : null}
    </div>
  );
}

function FlagRow({ flag, onResolve }: { flag: ReviewFlag; onResolve: () => void }) {
  return (
    <li className="flex flex-wrap items-start gap-3 text-[13px]">
      <span className="shrink-0 rounded-sm bg-canvas px-1.5 py-0.5 font-medium text-warn">
        {flag.field}
      </span>
      <span className="min-w-0 flex-1 text-warn">{flag.message}</span>
      <button
        type="button"
        onClick={onResolve}
        className="shrink-0 rounded-sm border border-warn px-1.5 py-0.5 font-medium text-warn hover:bg-canvas"
      >
        확인함
      </button>
    </li>
  );
}

function ProfileSummary({
  profile,
  onAddExperience,
}: {
  profile: ApplicantProfile;
  onAddExperience: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const grouped = groupByKind(profile.experiences);

  return (
    <div className="space-y-4">
      <div className="rounded-sm border border-rule bg-canvas px-5 py-4">
        <p className="text-[15px] font-bold text-ink">{profile.name || "이름 미입력"}</p>
        {profile.headline ? (
          <p className="mt-0.5 text-[13px] text-ink-muted">{profile.headline}</p>
        ) : null}
        <p className="tabular mt-2 text-[12px] text-ink-faint">
          경험 {profile.experiences.length}건 · 확인 필요{" "}
          {profile.experiences.filter((e) => e.confidence === "needs-confirmation").length}건
        </p>
        {profile.links.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-2">
            {profile.links.map((l) => (
              <li
                key={l.id}
                className="rounded-sm bg-surface px-2 py-1 text-[12px] text-ink-muted"
              >
                {l.label}
                {l.status === "link-only" ? (
                  <span className="ml-1 text-warn">링크만 저장됨</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {grouped.map(([kind, items]) => (
        <div key={kind} className="rounded-sm border border-rule bg-canvas">
          <p className="border-b border-rule bg-surface-sunken px-4 py-2.5 text-[13px] font-semibold text-ink">
            {EXPERIENCE_KIND_LABEL[kind]} · {items.length}
          </p>
          <ul className="divide-y divide-rule">
            {items.map((e) => (
              <li key={e.id} className="px-4 py-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <p className="text-[14px] font-medium text-ink">
                    {e.organization}
                    <span className="ml-1.5 font-normal text-ink-muted">{e.title}</span>
                  </p>
                  <p className="tabular shrink-0 text-[12px] text-ink-faint">
                    {e.start}
                    {e.end ? ` ~ ${e.end}` : " ~ 현재"}
                  </p>
                </div>
                {e.publicationStatus ? (
                  <p className="mt-1 text-[12px] text-ink-muted">
                    상태: {PUBLICATION_STATUS_LABEL[e.publicationStatus]}
                  </p>
                ) : null}
                {e.summary ? (
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{e.summary}</p>
                ) : null}
                {e.confidence === "needs-confirmation" ? (
                  <p className="mt-2 rounded-sm bg-warn-soft px-2 py-1 text-[12px] leading-relaxed text-warn">
                    확인 필요 — {e.note || "기간이나 본인 역할을 확인해 주세요."}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}

      <div className="rounded-sm border border-dashed border-rule-strong bg-canvas px-5 py-4">
        <label htmlFor="add-exp" className="text-[14px] font-semibold text-ink">
          빠진 경험 추가
        </label>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-faint">
          수업·대회·개인 프로젝트·봉사도 직무와 연결될 수 있습니다.
        </p>
        <textarea
          id="add-exp"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          placeholder="예) 게임잼 · 2024.06 · 4인 팀에서 플레이어 이동과 UI 구현, 동료 1명의 Git 사용 지원"
          className="mt-2.5 w-full rounded-sm border border-rule-strong bg-canvas px-3.5 py-2.5 text-[14px] leading-relaxed"
        />
        <button
          type="button"
          disabled={!draft.trim()}
          onClick={() => {
            onAddExperience(draft.trim());
            setDraft("");
          }}
          className="mt-2.5 rounded-sm border border-rule-strong px-4 py-2 text-[13px] font-medium text-ink hover:border-ink disabled:text-ink-faint"
        >
          추가
        </button>
      </div>
    </div>
  );
}

function QuestionCard({
  q,
  onAnswer,
}: {
  q: EnrichmentQuestion;
  onAnswer: ReviewScreenProps["onAnswer"];
}) {
  const [draft, setDraft] = useState(q.answer ?? "");
  const [open, setOpen] = useState(q.answerState === "answered");

  const STATE_LABEL: Record<EnrichmentQuestion["answerState"], string> = {
    unanswered: "",
    answered: "답변함",
    "material-added": "자료 추가",
    unknown: "아직 모름",
    skipped: "건너뜀",
  };

  return (
    <li className="rounded-sm border border-rule bg-canvas shadow-card">
      <div className="px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="min-w-0 flex-1 text-[14px] leading-relaxed font-medium text-ink">
            {q.question}
          </p>
          {q.answerState !== "unanswered" ? (
            <span className="shrink-0 rounded-sm bg-surface-sunken px-2 py-1 text-[12px] font-medium text-ink-muted">
              {STATE_LABEL[q.answerState]}
            </span>
          ) : null}
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-ink-faint">왜 묻나요? {q.why}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Choice label="답하기" active={open} onClick={() => setOpen(true)} />
          <Choice
            label="자료 추가"
            active={q.answerState === "material-added"}
            onClick={() => {
              setOpen(true);
              onAnswer(q.id, "material-added", draft);
            }}
          />
          <Choice
            label="아직 모름"
            active={q.answerState === "unknown"}
            onClick={() => {
              setOpen(false);
              onAnswer(q.id, "unknown");
            }}
          />
          <Choice
            label="건너뛰기"
            active={q.answerState === "skipped"}
            onClick={() => {
              setOpen(false);
              onAnswer(q.id, "skipped");
            }}
          />
        </div>

        {open ? (
          <div className="mt-4">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              placeholder="무엇을 바꾸었고 어떻게 측정했는지까지 적으면 근거로 쓸 수 있습니다."
              className="w-full rounded-sm border border-rule-strong bg-canvas px-3.5 py-2.5 text-[14px] leading-relaxed"
            />
            <button
              type="button"
              disabled={!draft.trim()}
              onClick={() => onAnswer(q.id, "answered", draft.trim())}
              className="mt-2.5 rounded-sm bg-ink px-4 py-2 text-[13px] font-medium text-white disabled:bg-rule-strong"
            >
              답변 저장
            </button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function Choice({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "rounded-sm border px-3.5 py-2 text-[13px] font-medium transition-colors",
        active
          ? "border-ink bg-ink text-white"
          : "border-rule-strong bg-canvas text-ink-muted hover:border-ink hover:text-ink",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

/** 같은 종류끼리 묶어 보여준다. 종류가 섞이면 "무엇을 넣었는지"를 확인하기 어렵다. */
function groupByKind(items: ExperienceItem[]) {
  const map = new Map<ExperienceItem["kind"], ExperienceItem[]>();
  for (const e of items) {
    const list = map.get(e.kind) ?? [];
    list.push(e);
    map.set(e.kind, list);
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
}
