/**
 * 6 확인·받기. (기획서 09)
 *
 * 두 결과물은 서로 다른 파일로 제공하고, 지원 회사별 버전을 구분한다.
 *   기업 제출용: 맞춤 Resume / CV 의 PDF·Word·일반 텍스트
 *   지원자 전용: 지원전략 분석서의 PDF·Word
 *
 * 미래(계획) 판본은 제출용 목록에 넣지 않는다 — 아직 사실이 아닌 항목을 담고 있기 때문.
 * 내려받기 전에 네 가지(내용·제출 적합성·문서 완성도·공개 범위)를 확인하게 한다.
 */
"use client";

import { useState } from "react";
import {
  RESUME_VARIANT_META,
  type Application,
  type PreflightCheck,
  type ResumeVariant,
} from "@/lib/types";
import { getTemplate } from "@/lib/templates";

const CATEGORY_LABEL: Record<PreflightCheck["category"], string> = {
  content: "내용",
  fit: "제출 적합성",
  polish: "문서 완성도",
  privacy: "공개 범위",
};

export type ExportFormat = "pdf" | "docx" | "txt";

export interface ExportScreenProps {
  app: Application;
  onToggleCheck: (id: string) => void;
  onDownloadResume: (variant: ResumeVariant, format: ExportFormat) => void;
  onDownloadReport: (format: Exclude<ExportFormat, "txt">) => void;
  onAddEvidence: () => void;
  busy?: string | null;
}

export function ExportScreen({
  app,
  onToggleCheck,
  onDownloadResume,
  onDownloadReport,
  onAddEvidence,
  busy,
}: ExportScreenProps) {
  const [confirmedFuture, setConfirmedFuture] = useState(false);
  const resumes = app.resumes;
  const report = app.report;
  if (!resumes || !report) return null;

  const submit = resumes[resumes.submitVariant];
  const template = getTemplate(submit.templateId);
  const allChecked = app.preflight.every((c) => c.checked);
  const remaining = app.preflight.filter((c) => !c.checked).length;

  const openActions = report.actions.filter((a) => a.status !== "evidence-submitted");

  return (
    <div className="space-y-10">
      <header>
        <p className="text-[12px] font-semibold tracking-wide text-brand">06 / DELIVERABLES</p>
        <h1 className="mt-1.5 text-xl leading-tight font-bold text-ink sm:text-2xl">
          두 결과물을 각각 확인하고 받으세요
        </h1>
        <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-ink-muted">
          기업에 내는 이력서와, 나만 보는 분석서는 서로 다른 파일입니다. 분석서의 점수·부족한
          부분·면접 메모·미래 계획은 제출용 이력서에 들어가지 않습니다.
        </p>
      </header>

      {/* 내려받기 전 확인 */}
      <section className="rounded-sm border border-rule bg-canvas shadow-card">
        <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule bg-surface-sunken px-5 py-4">
          <h2 className="text-lg font-bold text-ink">내려받기 전에 확인하기</h2>
          <p className="tabular text-[12px] text-ink-faint">
            {app.preflight.length - remaining}/{app.preflight.length} 확인
          </p>
        </header>
        <ul className="divide-y divide-rule">
          {app.preflight.map((c) => (
            <li key={c.id}>
              <label className="flex cursor-pointer items-start gap-3 px-5 py-4 hover:bg-surface">
                <input
                  type="checkbox"
                  checked={c.checked}
                  onChange={() => onToggleCheck(c.id)}
                  className="mt-0.5 size-4.5 shrink-0 accent-[var(--color-ink)]"
                />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-baseline gap-2">
                    <span className="rounded-sm bg-surface-sunken px-2 py-0.5 text-[12px] font-semibold text-ink-muted">
                      {CATEGORY_LABEL[c.category]}
                    </span>
                    <span className="text-[14px] font-medium text-ink">{c.label}</span>
                  </span>
                  <span className="mt-1 block text-[13px] leading-relaxed text-ink-muted">
                    {c.detail}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      {/*
        두 결과물 카드가 이 화면의 주인공이다. 제출용은 shadow-raised 로 한 층 더 띄워
        "기업에 나가는 파일"과 "나만 보는 파일"을 두께로도 구분한다.
      */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* 결과물 01 — 기업 제출용 */}
        <section className="rounded-sm border-2 border-ink bg-canvas shadow-raised">
          <header className="bg-ink px-5 py-5">
            <p className="text-[12px] font-semibold tracking-wide text-white/70">
              결과물 01 · 기업 제출용
            </p>
            <h2 className="mt-1.5 text-xl font-bold text-white">맞춤형 {submit.docType === "cv" ? "CV" : "Resume"}</h2>
          </header>
          <div className="px-5 py-5">
            <dl className="grid gap-x-4 gap-y-2 text-[13px] sm:grid-cols-[5rem_1fr]">
              <dt className="text-ink-faint">제출 판본</dt>
              <dd className="font-medium text-ink">
                {RESUME_VARIANT_META[resumes.submitVariant].title}
              </dd>
              <dt className="text-ink-faint">템플릿</dt>
              <dd className="text-ink">
                {template.name} · {template.koName}
              </dd>
              <dt className="text-ink-faint">언어·분량</dt>
              <dd className="text-ink">
                {submit.language === "ko" ? "국문" : "영문"} · 약 {submit.targetPages}쪽
              </dd>
              <dt className="text-ink-faint">파일명</dt>
              <dd className="text-ink-muted">{submit.versionLabel}</dd>
            </dl>

            {!allChecked ? (
              <p className="mt-4 rounded-sm bg-warn-soft px-3.5 py-2.5 text-[13px] leading-relaxed text-warn">
                확인하지 않은 항목이 {remaining}건 있습니다. 먼저 확인하면 잘못된 사실이 들어간 채로
                제출하는 일을 막을 수 있습니다.
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              {(["pdf", "docx", "txt"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => onDownloadResume(resumes.submitVariant, f)}
                  className="rounded-sm border border-ink bg-ink px-4 py-2.5 text-[14px] font-bold text-white shadow-card transition-shadow hover:shadow-raised disabled:opacity-50 disabled:shadow-none"
                >
                  {busy === `resume-${f}`
                    ? "만드는 중…"
                    : f === "pdf"
                      ? "PDF 인쇄"
                      : f === "docx"
                        ? "Word 받기"
                        : "텍스트 복사용"}
                </button>
              ))}
            </div>
            <p className="mt-2.5 text-[12px] leading-relaxed text-ink-faint">
              PDF 는 브라우저 인쇄 창에서 “PDF 로 저장”을 고르면 됩니다. 한글 글꼴이 그대로 들어갑니다.
              텍스트는 온라인 지원 폼에 붙여 넣는 용도입니다.
            </p>

            {/* 다른 판본도 받을 수 있게 하되, 제출 불가 판본은 분명히 구분한다. */}
            <details className="mt-5 border-t border-rule pt-4">
              <summary className="cursor-pointer list-none text-[13px] font-medium text-brand hover:underline">
                다른 판본도 받기
              </summary>
              <ul className="mt-3 space-y-3">
                {(["baseline", "story", "future"] as ResumeVariant[])
                  .filter((v) => v !== resumes.submitVariant)
                  .map((v) => {
                    const meta = RESUME_VARIANT_META[v];
                    const blocked = !meta.submittable && !confirmedFuture;
                    return (
                      <li key={v} className="rounded-sm border border-rule px-4 py-3">
                        <p className="text-[13px] font-bold text-ink">
                          {meta.title}
                          <span className="ml-1.5 font-normal text-ink-muted">
                            {resumes[v].narrative.matchScore}%
                          </span>
                        </p>
                        <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">{meta.note}</p>
                        {!meta.submittable ? (
                          <label className="mt-2.5 flex items-start gap-2 text-[12px] leading-relaxed text-goal">
                            <input
                              type="checkbox"
                              checked={confirmedFuture}
                              onChange={(e) => setConfirmedFuture(e.target.checked)}
                              className="mt-0.5 size-3.5 shrink-0 accent-[var(--color-goal)]"
                            />
                            <span>
                              이 파일을 기업에 제출하지 않고, 내 준비 계획을 보는 용도로만 쓰겠습니다.
                            </span>
                          </label>
                        ) : null}
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(["pdf", "docx", "txt"] as const).map((f) => (
                            <button
                              key={f}
                              type="button"
                              disabled={blocked || Boolean(busy)}
                              onClick={() => onDownloadResume(v, f)}
                              className="rounded-sm border border-rule-strong px-3.5 py-2 text-[12px] font-medium text-ink hover:border-ink disabled:border-rule disabled:text-ink-faint"
                            >
                              {f === "pdf" ? "PDF" : f === "docx" ? "Word" : "텍스트"}
                            </button>
                          ))}
                        </div>
                      </li>
                    );
                  })}
              </ul>
            </details>
          </div>
        </section>

        {/* 결과물 02 — 지원자 전용 */}
        <section className="rounded-sm border border-rule-strong bg-canvas shadow-card">
          <header className="border-b border-rule bg-surface-sunken px-5 py-5">
            <p className="text-[12px] font-semibold tracking-wide text-ink-muted">
              결과물 02 · 지원자 전용
            </p>
            <h2 className="mt-1.5 text-xl font-bold text-ink">지원전략 분석서</h2>
          </header>
          <div className="px-5 py-5">
            <p className="rounded-sm bg-surface px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-muted">
              기본 비공개입니다. 코치나 기관에 보여줄지는 직접 고르세요. 여기 담긴 점수·부족한 부분·
              미래 계획은 기업 제출용 이력서에 들어가지 않습니다.
            </p>
            <dl className="mt-4 grid gap-x-4 gap-y-2 text-[13px] sm:grid-cols-[5rem_1fr]">
              <dt className="text-ink-faint">매칭</dt>
              <dd className="tabular font-medium text-ink">
                <span className="text-now">{report.overall.display.current}%</span>
                <span className="mx-1 text-ink-faint">→</span>
                <span className="text-story">{report.overall.display.afterStory}%</span>
                <span className="mx-1 text-ink-faint">→</span>
                <span className="text-goal">{report.overall.display.target}%</span>
              </dd>
              <dt className="text-ink-faint">구성</dt>
              <dd className="text-ink">
                요약 1쪽 + 인재상·매칭 근거 / 경험 스토리 / 실행·목표 계획
              </dd>
            </dl>
            <div className="mt-5 flex flex-wrap gap-2">
              {(["pdf", "docx"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => onDownloadReport(f)}
                  className="rounded-sm border border-rule-strong bg-canvas px-4 py-2.5 text-[14px] font-bold text-ink shadow-card transition-shadow hover:border-ink hover:shadow-raised disabled:text-ink-faint disabled:shadow-none"
                >
                  {busy === `report-${f}` ? "만드는 중…" : f === "pdf" ? "PDF 인쇄" : "Word 받기"}
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* 남은 과제와 재평가 안내 */}
      {openActions.length > 0 ? (
        <section className="rounded-sm border border-rule bg-canvas px-5 py-5 shadow-card">
          <h2 className="text-lg font-bold text-ink">다음 준비</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
            아직 증거를 제출하지 않은 과제가 {openActions.length}건 있습니다. 결과물과 본인 역할을
            추가하면 해당 부문을 다시 평가하고, 이력서 문장도 함께 갱신합니다.
          </p>
          <ul className="mt-4 space-y-2">
            {openActions.slice(0, 4).map((a) => (
              <li key={a.id} className="text-[13px] leading-relaxed text-ink-muted">
                · <span className="font-medium text-ink">{a.gap}</span> — {a.reassessCriteria}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={onAddEvidence}
            className="mt-5 w-full rounded-sm border border-rule-strong bg-canvas px-5 py-3 text-[15px] font-bold text-ink shadow-card transition-shadow hover:border-ink hover:shadow-raised sm:w-auto"
          >
            새 근거 추가하러 가기
          </button>
        </section>
      ) : null}
    </div>
  );
}
