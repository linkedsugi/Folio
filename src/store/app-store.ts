/**
 * 지원 건 상태.
 *
 * 지원자 자료와 분석서는 기본 비공개이므로 서버로 보내지 않고 이 브라우저에만 둔다. (기획서 14)
 * 그래서 zustand + localStorage 이고, 서버 렌더와 어긋나지 않도록 hydration 완료를 따로 알린다.
 *
 * 이 파일이 지키는 규칙:
 *  - 과제 상태를 바꾸는 것만으로 점수가 움직이지 않는다. 재평가는 reassessNow() 에서만 일어난다.
 *  - 사실을 고치면 분석과 이력서에 함께 반영되어야 하므로, 문장 수정도 여기 한 곳을 지난다.
 *  - 미래(계획) 판본은 제출용으로 확정할 수 없다.
 */
"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  ActionCard,
  Application,
  ApplicantProfile,
  EnrichmentQuestion,
  ExperienceItem,
  JobPosting,
  Language,
  PreflightCheck,
  ResumeDocType,
  ResumeSet,
  ResumeVariant,
  SamplePackage,
  StageId,
  StrategyReport,
  TemplateId,
} from "@/lib/types";
import { reassess } from "@/lib/scoring";
import { makeId } from "@/lib/id";
import { buildResumeSet, rebuildAfterEdit, type ResumeLinePatch } from "@/lib/engine/resume-build";
import { markPromoted, promoteCompletedActions } from "@/lib/engine/promote";

/** 내려받기 전에 확인하는 내용. (기획서 09) */
function defaultPreflight(): PreflightCheck[] {
  return [
    {
      id: "pf-content",
      category: "content",
      label: "내용이 사실과 맞는가",
      detail: "기간·직함·학위·논문 상태·성과·본인 역할이 실제와 같은지 확인했습니다.",
      checked: false,
    },
    {
      id: "pf-fit",
      category: "fit",
      label: "제출 적합성",
      detail: "공고가 정한 양식·분량·언어를 따르고, 연락처와 링크가 맞습니다.",
      checked: false,
    },
    {
      id: "pf-polish",
      category: "polish",
      label: "문서 완성도",
      detail: "표현이 자연스럽고 줄 넘침이나 항목 누락 없이 읽힙니다.",
      checked: false,
    },
    {
      id: "pf-privacy",
      category: "privacy",
      label: "공개 범위",
      detail:
        "전 직장·고객의 비공개 정보와, 내부 분석·목표 계획이 제출 문서에서 빠져 있습니다.",
      checked: false,
    },
  ];
}

function emptyApplication(name?: string): Application {
  const now = new Date().toISOString();
  return {
    id: makeId("app"),
    name: name?.trim() || "새 지원",
    createdAt: now,
    updatedAt: now,
    stage: "intake",
    completedStages: [],
    posting: null,
    profile: null,
    questions: [],
    report: null,
    resumes: null,
    preflight: defaultPreflight(),
  };
}

export interface AppState {
  applications: Application[];
  activeId: string | null;

  createApplication: (name?: string) => string;
  createFromSample: (sample: SamplePackage) => string;
  deleteApplication: (id: string) => void;
  setActive: (id: string) => void;
  resetAll: () => void;

  updateActive: (recipe: (app: Application) => Application) => void;

  setPosting: (posting: JobPosting) => void;
  setProfile: (profile: ApplicantProfile) => void;
  setReport: (report: StrategyReport) => void;
  setResumes: (resumes: ResumeSet) => void;
  setQuestions: (questions: EnrichmentQuestion[]) => void;
  setStage: (stage: StageId) => void;
  markStageComplete: (stage: StageId) => void;

  answerQuestion: (
    id: string,
    state: EnrichmentQuestion["answerState"],
    answer?: string,
  ) => void;
  resolveFlag: (scope: "posting" | "profile", flagId: string) => void;
  addExperienceFromText: (text: string) => void;

  adoptStory: (storyId: string, adopted: boolean) => void;
  setActionStatus: (id: string, status: ActionCard["status"], evidence?: string) => void;
  saveActionToPlan: (id: string, saved: boolean) => void;
  /** 재평가. 반영하지 않은 과제와 이유를 돌려준다 — 왜 안 올랐는지 설명할 수 있어야 하므로. */
  reassessNow: () => { actionId: string; reason: string }[];

  setResumeVariant: (v: ResumeVariant) => void;
  setSubmitVariant: (v: Exclude<ResumeVariant, "future">) => void;
  updateResumeLine: (variant: ResumeVariant, lineId: string, patch: ResumeLinePatch) => void;
  setTemplate: (id: TemplateId) => void;
  setDocType: (t: ResumeDocType) => void;
  setLanguage: (l: Language) => void;

  togglePreflight: (id: string) => void;
}

/** 활성 지원 건 하나만 바꾸고 updatedAt 을 찍는다. */
function patchActive(
  state: Pick<AppState, "applications" | "activeId">,
  recipe: (app: Application) => Application,
): Partial<AppState> {
  const { applications, activeId } = state;
  if (!activeId) return {};
  return {
    applications: applications.map((a) =>
      a.id === activeId ? { ...recipe(a), updatedAt: new Date().toISOString() } : a,
    ),
  };
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      applications: [],
      activeId: null,

      createApplication: (name) => {
        const app = emptyApplication(name);
        set((s) => ({ applications: [app, ...s.applications], activeId: app.id }));
        return app.id;
      },

      createFromSample: (sample) => {
        const now = new Date().toISOString();
        const app: Application = {
          id: makeId("app"),
          name: `${sample.posting.company} · ${sample.posting.roleTitle}`,
          createdAt: now,
          updatedAt: now,
          // 샘플은 결과를 먼저 보여주는 것이 목적이므로 입력·확인 단계를 마친 것으로 둔다.
          stage: "baseline",
          completedStages: ["intake", "review"],
          posting: sample.posting,
          profile: sample.profile,
          questions: sample.questions,
          report: sample.report,
          resumes: sample.resumes,
          preflight: defaultPreflight(),
          sampleId: sample.id,
        };
        set((s) => ({ applications: [app, ...s.applications], activeId: app.id }));
        return app.id;
      },

      deleteApplication: (id) =>
        set((s) => {
          const applications = s.applications.filter((a) => a.id !== id);
          return {
            applications,
            activeId: s.activeId === id ? (applications[0]?.id ?? null) : s.activeId,
          };
        }),

      setActive: (id) => set({ activeId: id }),
      resetAll: () => set({ applications: [], activeId: null }),

      updateActive: (recipe) => set((s) => patchActive(s, recipe)),

      setPosting: (posting) => set((s) => patchActive(s, (a) => ({ ...a, posting }))),
      setProfile: (profile) => set((s) => patchActive(s, (a) => ({ ...a, profile }))),
      setReport: (report) => set((s) => patchActive(s, (a) => ({ ...a, report }))),
      setResumes: (resumes) => set((s) => patchActive(s, (a) => ({ ...a, resumes }))),
      setQuestions: (questions) => set((s) => patchActive(s, (a) => ({ ...a, questions }))),
      setStage: (stage) => set((s) => patchActive(s, (a) => ({ ...a, stage }))),

      markStageComplete: (stage) =>
        set((s) =>
          patchActive(s, (a) => ({
            ...a,
            completedStages: a.completedStages.includes(stage)
              ? a.completedStages
              : [...a.completedStages, stage],
          })),
        ),

      answerQuestion: (id, state, answer) =>
        set((s) =>
          patchActive(s, (a) => ({
            ...a,
            questions: a.questions.map((q) =>
              q.id === id ? { ...q, answerState: state, answer: answer ?? q.answer } : q,
            ),
          })),
        ),

      resolveFlag: (scope, flagId) =>
        set((s) =>
          patchActive(s, (a) => {
            if (scope === "posting" && a.posting) {
              return {
                ...a,
                posting: {
                  ...a.posting,
                  reviewFlags: a.posting.reviewFlags.map((f) =>
                    f.id === flagId ? { ...f, resolved: true } : f,
                  ),
                },
              };
            }
            if (scope === "profile" && a.profile) {
              return {
                ...a,
                profile: {
                  ...a.profile,
                  reviewFlags: a.profile.reviewFlags.map((f) =>
                    f.id === flagId ? { ...f, resolved: true } : f,
                  ),
                },
              };
            }
            return a;
          }),
        ),

      /**
       * 사용자가 직접 적은 경험을 추가한다.
       * 앱이 파싱해 만든 항목과 달리 사용자가 쓴 그대로이므로 확인 필요로 두지 않는다.
       * 다만 기간·역할이 비면 분석에서 다시 확인을 요청한다.
       */
      addExperienceFromText: (text) =>
        set((s) =>
          patchActive(s, (a) => {
            if (!a.profile) return a;
            const parts = text.split("·").map((p) => p.trim());
            const item: ExperienceItem = {
              id: makeId("exp-user"),
              kind: "project",
              organization: parts[0] || "직접 입력",
              title: parts[1] || "",
              start: "",
              end: null,
              summary: text,
              tasks: [text],
              outcomes: [],
              ownRole: "",
              responsibilityLevel: "participate",
              artifacts: [],
              skills: [],
              confidence: "needs-confirmation",
              note: "직접 입력한 경험입니다. 기간과 본인 역할을 채우면 분석에 더 정확히 반영됩니다.",
            };
            return { ...a, profile: { ...a.profile, experiences: [...a.profile.experiences, item] } };
          }),
        ),

      adoptStory: (storyId, adopted) =>
        set((s) =>
          patchActive(s, (a) =>
            a.report
              ? {
                  ...a,
                  report: {
                    ...a.report,
                    stories: a.report.stories.map((st) =>
                      st.id === storyId ? { ...st, adopted } : st,
                    ),
                  },
                }
              : a,
          ),
        ),

      // 상태만 바꾼다. 점수는 여기서 절대 움직이지 않는다.
      setActionStatus: (id, status, evidence) =>
        set((s) =>
          patchActive(s, (a) =>
            a.report
              ? {
                  ...a,
                  report: {
                    ...a.report,
                    actions: a.report.actions.map((c) =>
                      c.id === id
                        ? { ...c, status, submittedEvidence: evidence ?? c.submittedEvidence }
                        : c,
                    ),
                  },
                }
              : a,
          ),
        ),

      saveActionToPlan: (id, saved) =>
        set((s) =>
          patchActive(s, (a) =>
            a.report
              ? {
                  ...a,
                  report: {
                    ...a.report,
                    actions: a.report.actions.map((c) =>
                      c.id === id ? { ...c, savedToPlan: saved } : c,
                    ),
                  },
                }
              : a,
          ),
        ),

      /**
       * 재평가.
       * 증거가 제출된 과제만 점수에 반영하고, 같은 과제의 [예정] 문장을 사실 문장으로 옮긴다.
       * 반영하지 않은 것은 이유와 함께 돌려준다 — "왜 안 올랐나"에 답할 수 있어야 하므로.
       */
      reassessNow: () => {
        const state = get();
        const app = state.applications.find((a) => a.id === state.activeId);
        if (!app?.report) return [];

        const scored = reassess(app.report.dimensions, app.report.actions);
        const promotion = app.resumes
          ? promoteCompletedActions(app.resumes, app.report.actions)
          : null;
        const actions = promotion
          ? markPromoted(app.report.actions, promotion.promoted)
          : app.report.actions;

        set((s) =>
          patchActive(s, (a) => ({
            ...a,
            report: a.report
              ? {
                  ...a.report,
                  dimensions: scored.dimensions,
                  overall: scored.overall,
                  actions,
                }
              : a.report,
            resumes: promotion ? promotion.resumes : a.resumes,
          })),
        );

        // 점수에 반영되지 않은 것과 문장이 옮겨지지 않은 것을 합쳐 보여준다.
        const merged = new Map<string, string>();
        for (const i of scored.ignored) merged.set(i.actionId, i.reason);
        for (const sk of promotion?.skipped ?? []) {
          if (!merged.has(sk.actionId)) merged.set(sk.actionId, sk.reason);
        }
        return [...merged].map(([actionId, reason]) => ({ actionId, reason }));
      },

      setResumeVariant: (v) =>
        set((s) =>
          patchActive(s, (a) => (a.resumes ? { ...a, resumes: { ...a.resumes, active: v } } : a)),
        ),

      setSubmitVariant: (v) =>
        set((s) =>
          patchActive(s, (a) =>
            a.resumes ? { ...a, resumes: { ...a.resumes, submitVariant: v } } : a,
          ),
        ),

      updateResumeLine: (variant, lineId, patch) =>
        set((s) =>
          patchActive(s, (a) =>
            a.resumes ? { ...a, resumes: rebuildAfterEdit(a.resumes, variant, lineId, patch) } : a,
          ),
        ),

      // 템플릿·언어·문서 유형이 바뀌면 세 판본을 같은 근거로 다시 만든다.
      setTemplate: (id) => set((s) => patchActive(s, (a) => rebuildResumes(a, { templateId: id }))),
      setDocType: (t) => set((s) => patchActive(s, (a) => rebuildResumes(a, { docType: t }))),
      setLanguage: (l) => set((s) => patchActive(s, (a) => rebuildResumes(a, { language: l }))),

      togglePreflight: (id) =>
        set((s) =>
          patchActive(s, (a) => ({
            ...a,
            preflight: a.preflight.map((c) => (c.id === id ? { ...c, checked: !c.checked } : c)),
          })),
        ),
    }),
    {
      name: "rolefit-canvas",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ applications: s.applications, activeId: s.activeId }),
    },
  ),
);

/**
 * 이력서를 다시 만든다.
 *
 * 편집한 문장을 잃지 않도록, 새로 만든 판본에 기존 편집 상태(수정·제외)를 다시 입힌다.
 * 템플릿 변경이 "문서 표현만 바꾼다"는 원칙을 지키려면 내용이 살아 있어야 한다.
 */
function rebuildResumes(
  app: Application,
  opts: { templateId?: TemplateId; docType?: ResumeDocType; language?: Language },
): Application {
  if (!app.posting || !app.profile || !app.report || !app.resumes) return app;

  const current = app.resumes[app.resumes.active];
  const edits = new Map<string, { text: string; status: string }>();
  for (const v of ["baseline", "story", "future"] as ResumeVariant[]) {
    for (const s of app.resumes[v].sections) {
      for (const l of [...s.lines, ...s.entries.flatMap((e) => e.lines)]) {
        if (l.status !== "adopted" || l.text !== l.original) {
          edits.set(l.original, { text: l.text, status: l.status });
        }
      }
    }
  }

  const next = buildResumeSet(app.posting, app.profile, app.report, {
    docType: opts.docType ?? current.docType,
    language: opts.language ?? current.language,
    templateId: opts.templateId ?? current.templateId,
    targetPages: current.targetPages,
  });

  const restore = (set: ResumeSet): ResumeSet => {
    const apply = (doc: (typeof set)["baseline"]) => ({
      ...doc,
      sections: doc.sections.map((s) => ({
        ...s,
        lines: s.lines.map(reapply),
        entries: s.entries.map((e) => ({ ...e, lines: e.lines.map(reapply) })),
      })),
    });
    return {
      ...set,
      baseline: apply(set.baseline),
      story: apply(set.story),
      future: apply(set.future),
      active: app.resumes!.active,
      submitVariant: app.resumes!.submitVariant,
    };
  };

  function reapply<T extends { original: string; text: string; status: string }>(line: T): T {
    const edit = edits.get(line.original);
    return edit ? ({ ...line, text: edit.text, status: edit.status } as T) : line;
  }

  return { ...app, resumes: restore(next) };
}

/* ───────────────────────────────────── 셀렉터 */

export function useActiveApplication(): Application | null {
  return useAppStore((s) => s.applications.find((a) => a.id === s.activeId) ?? null);
}

export function useStageProgress(): { completed: StageId[]; current: StageId } {
  return useAppStore((s) => {
    const app = s.applications.find((a) => a.id === s.activeId);
    return { completed: app?.completedStages ?? [], current: app?.stage ?? "start" };
  });
}

/**
 * localStorage 를 읽어 상태가 복원되었는지.
 *
 * 서버에서는 저장된 지원 건을 알 수 없으므로, 복원 전에 그리면 화면이 한 번 깜빡인다.
 * 화면은 이 값이 true 가 될 때까지 저장된 내용을 그리지 않는다.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    // 이미 복원이 끝난 뒤에 마운트되는 경우도 있으므로 두 경로를 모두 본다.
    if (useAppStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    const unsub = useAppStore.persist.onFinishHydration(() => setHydrated(true));
    return unsub;
  }, []);
  return hydrated;
}
