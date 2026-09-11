/**
 * 이력서 편집. (기획서 08·09·10)
 *
 * 목표 직무 · 선택 템플릿 · 실시간 문서 미리보기를 한 화면에 두고,
 * 문장별로 채택·수정·제외한다.
 *
 * 내보내기 화면 위에 둔 이유: 기획서의 5(이력서 작성)와 6(확인·받기)은
 * 같은 문서를 보면서 이어지는 행동이다. 화면을 갈라 놓으면 "지금 보고 있는 문서"를
 * 놓치게 된다.
 */
"use client";

import { useMemo, useState } from "react";
import {
  RESUME_VARIANT_META,
  type ApplicantProfile,
  type JobPosting,
  type Language,
  type ResumeDocType,
  type ResumeLine,
  type ResumeSet,
  type ResumeVariant,
  type TemplateId,
} from "@/lib/types";
import { TEMPLATES } from "@/lib/templates";
import { ResumeDocumentView } from "@/components/resume/ResumeDocumentView";
import { ResumeEditor, type ResumeLinePatch } from "@/components/resume/ResumeEditor";
import { VariantSwitch, NarrativePanel } from "@/components/resume/VariantSwitch";

export interface ResumeWorkbenchProps {
  posting: JobPosting;
  profile: ApplicantProfile;
  resumes: ResumeSet;
  onSelectVariant: (v: ResumeVariant) => void;
  onSubmitVariant: (v: Exclude<ResumeVariant, "future">) => void;
  onTemplate: (id: TemplateId) => void;
  onDocType: (t: ResumeDocType) => void;
  onLanguage: (l: Language) => void;
  onLineChange: (variant: ResumeVariant, lineId: string, patch: ResumeLinePatch) => void;
}

export function ResumeWorkbench({
  posting,
  profile,
  resumes,
  onSelectVariant,
  onSubmitVariant,
  onTemplate,
  onDocType,
  onLanguage,
  onLineChange,
}: ResumeWorkbenchProps) {
  const [activeLine, setActiveLine] = useState<ResumeLine | null>(null);
  const doc = resumes[resumes.active];
  const meta = RESUME_VARIANT_META[resumes.active];

  const experience = useMemo(
    () =>
      activeLine?.experienceId
        ? profile.experiences.find((e) => e.id === activeLine.experienceId)
        : undefined,
    [activeLine, profile.experiences],
  );

  // 문서 유형에 맞는 템플릿만 고르게 한다 — Resume 와 학술 CV 는 내용 구성부터 다르다.
  const templates = TEMPLATES.filter((t) => t.docType === doc.docType);

  const stats = useMemo(() => {
    const all = doc.sections.flatMap((s) => [...s.lines, ...s.entries.flatMap((e) => e.lines)]);
    return {
      total: all.length,
      excluded: all.filter((l) => l.status === "excluded").length,
      edited: all.filter((l) => l.status === "edited").length,
      planned: all.filter((l) => l.basis === "planned").length,
    };
  }, [doc]);

  return (
    <div className="space-y-4">
      <header>
        <p className="text-[11px] font-semibold tracking-wide text-brand">05 / RESUME</p>
        <h2 className="mt-0.5 text-xl leading-tight font-bold text-ink">이력서 편집</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
          {posting.company} · {posting.roleTitle} 에 맞춰 선별한 문장입니다. 문장을 눌러
          채택·수정·제외하고, 왜 그 경험을 넣었는지 확인하세요.
        </p>
      </header>

      <VariantSwitch
        set={resumes}
        onSelect={(v) => {
          setActiveLine(null);
          onSelectVariant(v);
        }}
        onSubmitVariantChange={onSubmitVariant}
      />

      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        <div className="space-y-3 lg:sticky lg:top-24 lg:self-start">
          {/* 문서 설정 */}
          <section className="rounded-sm border border-rule bg-canvas px-3 py-3">
            <h3 className="text-[12px] font-bold text-ink">문서 설정</h3>
            {posting.documentRules?.note ? (
              <p className="mt-1 rounded-sm bg-warn-soft px-2 py-1 text-[11px] leading-snug text-warn">
                공고가 정한 조건: {posting.documentRules.note} — 공고 조건을 우선합니다.
              </p>
            ) : null}

            <Control label="문서 유형">
              <div className="flex gap-1.5">
                {(["resume", "cv"] as const).map((t) => (
                  <Toggle
                    key={t}
                    active={doc.docType === t}
                    onClick={() => onDocType(t)}
                    label={t === "resume" ? "일반 이력서" : "학술 CV"}
                  />
                ))}
              </div>
            </Control>

            <Control label="언어">
              <div className="flex gap-1.5">
                {(["ko", "en"] as const).map((l) => (
                  <Toggle
                    key={l}
                    active={doc.language === l}
                    onClick={() => onLanguage(l)}
                    label={l === "ko" ? "국문" : "영문"}
                  />
                ))}
              </div>
            </Control>

            <Control label="템플릿">
              <ul className="space-y-1">
                {templates.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => onTemplate(t.id)}
                      aria-pressed={doc.templateId === t.id}
                      className={[
                        "w-full rounded-sm border px-2 py-1.5 text-left transition-colors",
                        doc.templateId === t.id
                          ? "border-ink bg-surface-sunken"
                          : "border-rule hover:border-rule-strong",
                      ].join(" ")}
                    >
                      <span className="flex items-baseline gap-1.5">
                        <span
                          aria-hidden
                          className="size-2 shrink-0 rounded-full"
                          style={{ background: t.accent }}
                        />
                        <span className="text-[12px] font-bold text-ink">{t.name}</span>
                        <span className="text-[11px] text-ink-muted">{t.koName}</span>
                      </span>
                      <span className="mt-0.5 block text-[10px] leading-snug text-ink-faint">
                        {t.fitFor} · {t.emphasis}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[10px] leading-snug text-ink-faint">
                템플릿·색·서체 변경은 문서 표현만 바꿉니다. 매칭률은 달라지지 않습니다.
              </p>
            </Control>
          </section>

          {/* 편집 상태 */}
          <section className="rounded-sm border border-rule bg-canvas px-3 py-2.5">
            <h3 className="text-[12px] font-bold text-ink">이 판본의 문장</h3>
            <dl className="tabular mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
              <dt className="text-ink-faint">전체</dt>
              <dd className="text-right font-medium text-ink">{stats.total}</dd>
              <dt className="text-ink-faint">수정함</dt>
              <dd className="text-right font-medium text-ink">{stats.edited}</dd>
              <dt className="text-ink-faint">제외함</dt>
              <dd className="text-right font-medium text-ink">{stats.excluded}</dd>
              {stats.planned > 0 ? (
                <>
                  <dt className="text-goal">예정 문장</dt>
                  <dd className="text-right font-medium text-goal">{stats.planned}</dd>
                </>
              ) : null}
            </dl>
          </section>

          {activeLine ? (
            <ResumeEditor
              line={activeLine}
              experience={experience}
              onChange={(patch) => {
                onLineChange(resumes.active, activeLine.id, patch);
                setActiveLine({ ...activeLine, ...patch });
              }}
              onClose={() => setActiveLine(null)}
              readOnlyReason={
                meta.submittable
                  ? undefined
                  : "미래(계획) 판본은 실행 과제에서 자동으로 만들어집니다. 문장을 직접 고치려면 제출 가능한 판본에서 편집하세요."
              }
            />
          ) : (
            <p className="rounded-sm border border-dashed border-rule-strong px-3 py-2.5 text-[11px] leading-snug text-ink-faint">
              오른쪽 지면에서 문장을 누르면 여기서 편집할 수 있습니다.
            </p>
          )}

          <NarrativePanel set={resumes} />
        </div>

        <div className="overflow-x-auto rounded-sm bg-surface-sunken p-3">
          <ResumeDocumentView
            doc={doc}
            onLineClick={(line) => setActiveLine(line)}
            activeLineId={activeLine?.id ?? null}
          />
        </div>
      </div>
    </div>
  );
}

function Control({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-2.5">
      <p className="mb-1 text-[11px] font-semibold tracking-wide text-ink-faint">{label}</p>
      {children}
    </div>
  );
}

function Toggle({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "rounded-sm border px-2 py-1 text-[12px] font-medium transition-colors",
        active
          ? "border-ink bg-ink text-white"
          : "border-rule-strong bg-canvas text-ink-muted hover:border-ink hover:text-ink",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
