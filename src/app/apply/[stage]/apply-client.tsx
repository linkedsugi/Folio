/**
 * 단계 오케스트레이션.
 *
 * 파이프라인을 한 곳에서 진행시킨다:
 *   intake → (JD 분석 · 이력 분석) → review → baseline → story → plan → export
 *
 * 각 단계는 앞 단계의 결과 위에서만 열린다. 아직 도달하지 않은 단계로 직접 들어오면
 * 마지막으로 유효한 단계로 되돌린다 — 빈 화면을 보여주는 것보다 낫다.
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ActionCard,
  EnrichmentQuestion,
  Language,
  ResumeDocType,
  ResumeVariant,
  StageId,
  TemplateId,
} from "@/lib/types";
import { RESUME_VARIANT_META } from "@/lib/types";
import { runPipeline } from "@/lib/engine/pipeline";
import type { ResumeLinePatch } from "@/components/resume/ResumeEditor";
import { useActiveApplication, useAppStore, useHydrated } from "@/store/app-store";
import { AppShell } from "@/components/AppShell";
import { IntakeScreen, type IntakeValue } from "@/components/screens/IntakeScreen";
import { ReviewScreen } from "@/components/screens/ReviewScreen";
import { MappingScreen } from "@/components/screens/MappingScreen";
import { ResumeWorkbench } from "@/components/screens/ResumeWorkbench";
import { ExportScreen, type ExportFormat } from "@/components/screens/ExportScreen";

const EMPTY_INTAKE: IntakeValue = {
  jdText: "",
  jdUrl: "",
  profileText: "",
  profileName: "",
  links: [],
};

export function ApplyClient({ stage }: { stage: Exclude<StageId, "start"> }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const app = useActiveApplication();
  const store = useAppStore();

  const [intake, setIntake] = useState<IntakeValue>(EMPTY_INTAKE);
  const [busy, setBusy] = useState<string | null>(null);
  const [ignored, setIgnored] = useState<{ actionId: string; reason: string }[]>([]);

  const go = useCallback(
    (next: StageId) => {
      store.setStage(next);
      router.push(next === "start" ? "/" : `/apply/${next}`);
    },
    [router, store],
  );

  // 지원 건이 없으면 시작 화면으로. 분석 전 단계에 직접 들어오면 입력으로 되돌린다.
  useEffect(() => {
    if (!hydrated) return;
    if (!app) {
      router.replace("/");
      return;
    }
    const needsReport: StageId[] = ["review", "baseline", "story", "plan", "export"];
    if (needsReport.includes(stage) && !app.report) {
      router.replace("/apply/intake");
    }
  }, [hydrated, app, stage, router]);

  const runAnalysis = useCallback(() => {
    setBusy("analyze");
    try {
      const result = runPipeline({
        jdText: intake.jdText,
        profileText: intake.profileText,
        name: intake.profileName || undefined,
        links: intake.links.map((l) => ({ label: l.label, url: l.url })),
      });
      store.setPosting(result.posting);
      store.setProfile(result.profile);
      store.setReport(result.report);
      store.setResumes(result.resumes);
      store.setQuestions(result.questions ?? []);
      store.markStageComplete("intake");
      go("review");
    } finally {
      setBusy(null);
    }
  }, [intake, store, go]);

  const printDoc = useCallback(
    (path: string) => {
      // 인쇄 경로를 새 탭으로 연다. 현재 화면의 편집 상태를 잃지 않기 위해서다.
      window.open(path, "_blank", "noopener");
    },
    [],
  );

  const downloadResume = useCallback(
    async (variant: ResumeVariant, format: ExportFormat) => {
      if (!app?.resumes || !app.posting) return;
      const doc = app.resumes[variant];
      if (format === "pdf") {
        printDoc(`/print/resume?variant=${variant}`);
        return;
      }
      setBusy(`resume-${format}`);
      try {
        const [{ resumeFileName }, { resumeToPlainText }] = await Promise.all([
          import("@/lib/export/filename"),
          import("@/lib/export/text"),
        ]);
        const stamp = new Date().toISOString().slice(0, 7);
        if (format === "txt") {
          const text = resumeToPlainText(doc);
          const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
          const { downloadBlob } = await import("@/lib/export/docx");
          await downloadBlob(blob, resumeFileName(app, variant, "txt", stamp));
        } else {
          const { buildResumeDocx, downloadBlob } = await import("@/lib/export/docx");
          const { getTemplate } = await import("@/lib/templates");
          const blob = await buildResumeDocx(doc, getTemplate(doc.templateId));
          await downloadBlob(blob, resumeFileName(app, variant, "docx", stamp));
        }
      } finally {
        setBusy(null);
      }
    },
    [app, printDoc],
  );

  const downloadReport = useCallback(
    async (format: "pdf" | "docx") => {
      if (!app?.report || !app.posting || !app.profile) return;
      if (format === "pdf") {
        printDoc("/print/report");
        return;
      }
      setBusy("report-docx");
      try {
        const [{ buildReportDocx }, { downloadBlob }, { reportFileName }] = await Promise.all([
          import("@/lib/export/report-docx"),
          import("@/lib/export/docx"),
          import("@/lib/export/filename"),
        ]);
        const stamp = new Date().toISOString().slice(0, 7);
        const blob = await buildReportDocx(app.report, app.posting, app.profile);
        await downloadBlob(blob, reportFileName(app, "docx", stamp));
      } finally {
        setBusy(null);
      }
    },
    [app, printDoc],
  );

  const content = useMemo(() => {
    if (!hydrated || !app) return null;

    switch (stage) {
      case "intake":
        return (
          <IntakeScreen
            value={intake}
            onChange={(patch) => setIntake((v) => ({ ...v, ...patch }))}
            onSubmit={runAnalysis}
            busy={busy === "analyze"}
          />
        );

      case "review":
        if (!app.posting || !app.profile) return null;
        return (
          <ReviewScreen
            posting={app.posting}
            profile={app.profile}
            questions={app.questions}
            onAnswer={(id, state, answer) => store.answerQuestion(id, state, answer)}
            onResolveFlag={(scope, flagId) => store.resolveFlag(scope, flagId)}
            onAddExperience={(text) => store.addExperienceFromText(text)}
            onNext={() => {
              store.markStageComplete("review");
              go("baseline");
            }}
          />
        );

      case "baseline":
      case "story":
      case "plan": {
        if (!app.posting || !app.profile || !app.report || !app.resumes) return null;
        const next: Record<typeof stage, { to: StageId; label: string }> = {
          baseline: { to: "story", label: "스토리텔링으로 어디까지 설명되는지 보기" },
          story: { to: "plan", label: "남는 차이를 과제와 목표로 바꾸기" },
          plan: { to: "export", label: "이력서 편집하고 문서 받기" },
        };
        return (
          <MappingScreen
            stage={stage}
            posting={app.posting}
            profile={app.profile}
            report={app.report}
            resumes={app.resumes}
            onAdoptStory={(id, adopted) => store.adoptStory(id, adopted)}
            onActionStatus={(id, s, ev) => store.setActionStatus(id, s, ev)}
            onSaveActionToPlan={(id, saved) => store.saveActionToPlan(id, saved)}
            onReassess={() => setIgnored(store.reassessNow())}
            reassessIgnored={ignored}
            onNext={() => {
              store.markStageComplete(stage);
              go(next[stage].to);
            }}
            nextLabel={next[stage].label}
          />
        );
      }

      case "export":
        if (!app.posting || !app.profile || !app.report || !app.resumes) return null;
        return (
          <div className="space-y-10">
            <ResumeWorkbench
              posting={app.posting}
              profile={app.profile}
              resumes={app.resumes}
              onSelectVariant={(v) => store.setResumeVariant(v)}
              onSubmitVariant={(v) => store.setSubmitVariant(v)}
              onTemplate={(id: TemplateId) => store.setTemplate(id)}
              onDocType={(t: ResumeDocType) => store.setDocType(t)}
              onLanguage={(l: Language) => store.setLanguage(l)}
              onLineChange={(variant, lineId, patch: ResumeLinePatch) =>
                store.updateResumeLine(variant, lineId, patch)
              }
            />
            <ExportScreen
              app={app}
              onToggleCheck={(id) => store.togglePreflight(id)}
              onDownloadResume={downloadResume}
              onDownloadReport={downloadReport}
              onAddEvidence={() => go("plan")}
              busy={busy}
            />
          </div>
        );

      default:
        return null;
    }
  }, [
    hydrated,
    app,
    stage,
    intake,
    busy,
    ignored,
    store,
    go,
    runAnalysis,
    downloadResume,
    downloadReport,
  ]);

  if (!hydrated) {
    return (
      <AppShell app={null} stage={stage}>
        <p className="py-16 text-center text-sm text-ink-muted">불러오는 중…</p>
      </AppShell>
    );
  }

  return (
    <AppShell app={app} stage={stage} onStageSelect={go}>
      {content}
    </AppShell>
  );
}

/** 실행 과제 상태 타입을 화면 밖으로 새어 나가지 않게 다시 내보낸다. */
export type { ActionCard, EnrichmentQuestion };
export { RESUME_VARIANT_META };
