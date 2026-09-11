/**
 * 단계 오케스트레이션.
 *
 * 파이프라인을 한 곳에서 진행시킨다:
 *   intake → (JD 분석 · 이력 분석) → review → baseline → story → plan → export
 *
 * 각 단계는 앞 단계의 결과 위에서만 열린다. 아직 도달하지 않은 단계로 직접 들어오면
 * 마지막으로 유효한 단계로 되돌린다 — 빈 화면을 보여주는 것보다 낫다.
 *
 * ── 정밀 분석이 끼어드는 자리 ────────────────────────────────
 * 분석은 언제나 규칙 엔진(runPipeline)이 먼저 끝낸다. 그 결과가 진실이고, 화면에
 * 나갈 것이 이미 완성된 상태에서만 /api/analyze 에 보강을 부탁한다.
 * 그래서 정밀 분석이 실패하든, 서버가 없든, 동의하지 않았든 사용자가 보는 것은
 * 늘 완전한 분석서다. 달라지는 것은 문장이 얼마나 다듬어졌는지와,
 * 화면이 "왜 규칙 기반으로 갔는지" 한 줄을 덧붙이는지뿐이다.
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
import type { ApplicantProfile, JobPosting, StrategyReport } from "@/lib/types";
import { runPipeline } from "@/lib/engine/pipeline";
import { buildResumeSet } from "@/lib/engine/resume-build";
import { findModel } from "@/lib/llm/models";
import { canUseLlm, llmUnavailableReason } from "@/lib/llm/settings";
import { isSessionValid } from "@/lib/auth/types";
import type { ResumeLinePatch } from "@/components/resume/ResumeEditor";
import {
  useActiveApplication,
  useAppStore,
  useHydrated,
} from "@/store/app-store";
import { useAuthStore } from "@/store/auth-store";
import {
  useLastAnalysis,
  useLlmSettings,
  useSettingsStore,
  type AnalysisOutcome,
} from "@/store/settings-store";
import { AppShell } from "@/components/AppShell";
import { Callout } from "@/components/ui";
import {
  IntakeScreen,
  type IntakeValue,
} from "@/components/screens/IntakeScreen";
import { ReviewScreen } from "@/components/screens/ReviewScreen";
import { MappingScreen } from "@/components/screens/MappingScreen";
import { ResumeWorkbench } from "@/components/screens/ResumeWorkbench";
import {
  ExportScreen,
  type ExportFormat,
} from "@/components/screens/ExportScreen";

/** 보강을 얹다 예기치 못하게 실패했을 때. 사용자는 규칙 기반 결과를 그대로 받는다. */
const ENRICH_CRASH_REASON =
  "정밀 분석을 반영하는 중 문제가 생겨 기기 안에서 분석한 결과를 그대로 보여 드립니다.";

const EMPTY_INTAKE: IntakeValue = {
  jdText: "",
  jdUrl: "",
  profileText: "",
  profileName: "",
  links: [],
};

/* ─────────────────────────────── 정밀 분석 부탁하기 */

const NO_SERVER_REASON =
  "이 배포에는 정밀 분석 서버가 없어 기기 안에서 분석했습니다.";
const NETWORK_REASON = "정밀 분석 서버에 닿지 못해 기기 안에서 분석했습니다.";
const UNREADABLE_REASON =
  "정밀 분석 결과를 읽지 못해 기기 안에서 분석한 결과를 씁니다.";
const SHAPE_MISMATCH_REASON =
  "정밀 분석 결과가 기기에서 계산한 값과 달라 쓰지 않았습니다. 화면의 수치는 규칙 기반 그대로입니다.";

type PrecisionResult =
  | {
      ok: true;
      report: StrategyReport;
      usedLlm: boolean;
      modelId?: string;
      reason: string | null;
    }
  | { ok: false; reason: string };

/**
 * /api/analyze 한 번 부르기.
 *
 * 절대 던지지 않는다. 이 호출이 예외로 끝나면 이미 완성된 규칙 기반 결과까지
 * 화면에 못 올라가기 때문이다. 실패는 전부 "이유가 붙은 값" 으로 돌려준다.
 */
async function requestPrecision(
  payload: {
    posting: JobPosting;
    profile: ApplicantProfile;
    report: StrategyReport;
  },
  idToken: string | null,
): Promise<PrecisionResult> {
  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // 신원 확인이 아니라 호출 한도 때문이다 — 서명이 확인된 사람은 넉넉한 한도를 받는다.
        ...(idToken ? { authorization: `Bearer ${idToken}` } : {}),
      },
      // 동의는 여기서 처음이자 마지막으로 참이 된다. 부르는 쪽이 이미 확인했다.
      body: JSON.stringify({ ...payload, consent: true }),
    });

    // 정적 배포에서는 404 HTML 이 돌아온다. 그것을 분석 결과로 착각하지 않는다.
    if (!(res.headers.get("content-type") ?? "").includes("application/json")) {
      return { ok: false, reason: NO_SERVER_REASON };
    }

    const data = (await res.json()) as {
      ok?: unknown;
      report?: StrategyReport;
      usedLlm?: unknown;
      modelId?: unknown;
      reason?: unknown;
    };
    const reason = typeof data.reason === "string" ? data.reason : null;
    if (data.ok !== true || !data.report) {
      // ok:false 는 고장이 아니라 "규칙 기반으로 간다" 는 정상 응답이다. 이유만 받아 온다.
      return { ok: false, reason: reason ?? UNREADABLE_REASON };
    }
    return {
      ok: true,
      report: data.report,
      usedLlm: data.usedLlm === true,
      modelId: typeof data.modelId === "string" ? data.modelId : undefined,
      reason,
    };
  } catch {
    return { ok: false, reason: NETWORK_REASON };
  }
}

/**
 * 보강된 분석서가 규칙 기반 결과와 같은 뼈대인가.
 *
 * 서버는 문장만 바꾸기로 되어 있다. 그 약속을 화면 쪽에서 한 번 더 확인하는 이유는,
 * 점수나 부문이 달라진 응답을 그대로 올리면 "규칙 엔진이 진실" 이라는 말이 무너지고
 * 같은 이력에 다른 매칭률이 나오기 때문이다. 어긋나면 보강을 통째로 버린다.
 */
function keepsRuleBasedShape(
  base: StrategyReport,
  next: StrategyReport,
): boolean {
  if (!next || typeof next !== "object") return false;
  if (
    !Array.isArray(next.dimensions) ||
    next.dimensions.length !== base.dimensions.length
  ) {
    return false;
  }
  const sameDimensions = base.dimensions.every((dim, i) => {
    const other = next.dimensions[i];
    return (
      other?.id === dim.id &&
      other.weight === dim.weight &&
      other.current === dim.current &&
      other.afterStory === dim.afterStory &&
      other.target === dim.target
    );
  });
  if (!sameDimensions) return false;

  const display = next.overall?.display;
  if (
    !display ||
    display.current !== base.overall.display.current ||
    display.afterStory !== base.overall.display.afterStory ||
    display.target !== base.overall.display.target
  ) {
    return false;
  }

  if (next.verdict !== base.verdict) return false;
  // 목록의 개수가 줄면 규칙 엔진이 찾아낸 이야기나 과제가 조용히 사라진 것이다.
  if (
    !Array.isArray(next.stories) ||
    next.stories.length !== base.stories.length
  )
    return false;
  if (
    !Array.isArray(next.actions) ||
    next.actions.length !== base.actions.length
  )
    return false;
  return true;
}

export function ApplyClient({ stage }: { stage: Exclude<StageId, "start"> }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const app = useActiveApplication();
  const store = useAppStore();

  const settings = useLlmSettings();
  const loadSettings = useSettingsStore((s) => s.load);
  const noteAnalysis = useSettingsStore((s) => s.noteAnalysis);
  const lastAnalysis = useLastAnalysis();
  const session = useAuthStore((s) => s.session);

  const [intake, setIntake] = useState<IntakeValue>(EMPTY_INTAKE);
  const [busy, setBusy] = useState<string | null>(null);
  const [ignored, setIgnored] = useState<
    { actionId: string; reason: string }[]
  >([]);
  /**
   * 이번 분석에 대한 동의.
   *
   * 화면 안의 상태로만 두고 저장하지 않는다. 저장하는 순간 지난번에 누른 동의가
   * 다음 지원 건까지 따라가고, 그러면 사용자는 자기 자료가 나가는 줄 모른 채 보내게 된다.
   *
   * 어느 지원 건에 대한 동의였는지를 함께 들고 있는 이유: 지원 건을 바꾸면 동의는
   * 저절로 무효가 되어야 한다. 그 일을 효과로 되돌리면 한 번은 옛 동의가 살아 있는
   * 순간이 생기는데, 동의에서는 그 한 번이 곧 자료 전송이다.
   */
  const [consent, setConsent] = useState<{
    appId: string | null;
    agreed: boolean;
  }>({
    appId: null,
    agreed: false,
  });
  const consented = consent.agreed && consent.appId === (app?.id ?? null);

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
    const needsReport: StageId[] = [
      "review",
      "baseline",
      "story",
      "plan",
      "export",
    ];
    if (needsReport.includes(stage) && !app.report) {
      router.replace("/apply/intake");
    }
  }, [hydrated, app, stage, router]);

  // 입력 화면에서만 설정을 읽는다. 동의 칸이 "지금 정밀 분석을 쓸 수 있는가" 를 알아야
  // 하기 때문이고, 그 밖의 단계에서는 물어볼 이유가 없다. (설정만 읽을 뿐 자료는 나가지 않는다.)
  useEffect(() => {
    if (stage === "intake") void loadSettings();
  }, [stage, loadSettings]);

  const runAnalysis = useCallback(async () => {
    setBusy("analyze");
    try {
      // 1. 규칙 기반 결과를 먼저 완성한다. 이 아래에서 무엇이 실패해도 이 결과는 그대로 나간다.
      const result = runPipeline({
        jdText: intake.jdText,
        profileText: intake.profileText,
        name: intake.profileName || undefined,
        links: intake.links.map((l) => ({ label: l.label, url: l.url })),
      });

      let report = result.report;
      let resumes = result.resumes;
      let outcome: AnalysisOutcome = {
        usedLlm: false,
        reason: llmUnavailableReason(settings, consented),
        at: new Date().toISOString(),
      };

      // 2. 동의했고 쓸 수 있을 때만 요청을 만든다.
      //    동의하지 않았으면 요청 자체가 없다 — 보내지 않기로 한 자료는 담지도 않는다.
      if (canUseLlm(settings, consented)) {
        /*
         * 규칙 기반 결과는 위에서 이미 손에 들어왔다.
         * 보강을 얹다 무엇이 터지든 **그것을 잃어서는 안 된다.**
         * 여기서 던지면 setReport 도 go() 도 못 가고, 사용자는 이미 끝난 계산까지 잃는다.
         */
        try {
          const idToken =
            session && isSessionValid(session, new Date().toISOString())
              ? session.idToken
              : null;
          const precision = await requestPrecision(
            {
              posting: result.posting,
              profile: result.profile,
              report: result.report,
            },
            idToken,
          );

          if (!precision.ok) {
            outcome = { ...outcome, usedLlm: false, reason: precision.reason };
          } else if (!keepsRuleBasedShape(result.report, precision.report)) {
            outcome = {
              ...outcome,
              usedLlm: false,
              reason: SHAPE_MISMATCH_REASON,
            };
          } else {
            report = precision.report;
            /*
             * 3. 문장이 바뀌었으니 이력서도 같은 분석서에서 다시 만든다.
             *    이력서 문장은 분석서의 스토리에서 나오므로, 다시 만들지 않으면
             *    분석서와 이력서가 서로 다른 말을 하게 된다.
             *    뼈대가 규칙 기반과 같다는 것은 바로 위에서 확인했으므로 수치는 흔들리지 않는다.
             */
            resumes = buildResumeSet(result.posting, result.profile, report);
            outcome = {
              ...outcome,
              usedLlm: precision.usedLlm,
              reason: precision.reason,
              modelId: precision.usedLlm ? precision.modelId : undefined,
            };
          }
        } catch {
          // 보강에 실패해도 분석은 끝난다. 규칙 기반 결과를 그대로 쓴다.
          report = result.report;
          resumes = result.resumes;
          outcome = { ...outcome, usedLlm: false, reason: ENRICH_CRASH_REASON };
        }
      }

      store.setPosting(result.posting);
      store.setProfile(result.profile);
      store.setReport(report);
      store.setResumes(resumes);
      store.setQuestions(result.questions ?? []);
      // 어느 길로 갔는지 남긴다. 결과 화면이 이것을 읽어 "왜 규칙 기반인지" 를 말한다.
      noteAnalysis(outcome);
      store.markStageComplete("intake");
      go("review");
    } finally {
      // 동의는 이번 한 번으로 끝난다. 다음 분석은 해제된 칸에서 다시 시작한다.
      setConsent((c) => ({ ...c, agreed: false }));
      setBusy(null);
    }
  }, [intake, store, go, settings, consented, session, noteAnalysis]);

  const printDoc = useCallback((path: string) => {
    // 인쇄 경로를 새 탭으로 연다. 현재 화면의 편집 상태를 잃지 않기 위해서다.
    window.open(path, "_blank", "noopener");
  }, []);

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
          const { buildResumeDocx, downloadBlob } =
            await import("@/lib/export/docx");
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
        const [{ buildReportDocx }, { downloadBlob }, { reportFileName }] =
          await Promise.all([
            import("@/lib/export/report-docx"),
            import("@/lib/export/docx"),
            import("@/lib/export/filename"),
          ]);
        const stamp = new Date().toISOString().slice(0, 7);
        const blob = await buildReportDocx(
          app.report,
          app.posting,
          app.profile,
        );
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
            onSubmit={() => void runAnalysis()}
            busy={busy === "analyze"}
            consent={{
              // 동의 이전의 조건만 본다 — 관리자가 켰는가, 서버에 키가 있는가.
              available: canUseLlm(settings, true),
              unavailableReason: llmUnavailableReason(settings, true),
              modelLabel:
                findModel(settings.modelId)?.label ?? settings.modelId,
              consented,
              onConsentChange: (agreed) =>
                setConsent({ appId: app?.id ?? null, agreed }),
            }}
          />
        );

      case "review":
        if (!app.posting || !app.profile) return null;
        return (
          <ReviewScreen
            posting={app.posting}
            profile={app.profile}
            questions={app.questions}
            onAnswer={(id, state, answer) =>
              store.answerQuestion(id, state, answer)
            }
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
        if (!app.posting || !app.profile || !app.report || !app.resumes)
          return null;
        const next: Record<typeof stage, { to: StageId; label: string }> = {
          baseline: {
            to: "story",
            label: "스토리텔링으로 어디까지 설명되는지 보기",
          },
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
            onSaveActionToPlan={(id, saved) =>
              store.saveActionToPlan(id, saved)
            }
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
        if (!app.posting || !app.profile || !app.report || !app.resumes)
          return null;
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
    settings,
    consented,
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
      {/* 결과를 읽기 전에, 이 결과가 무엇으로 만들어졌는지부터 말한다. */}
      {stage !== "intake" && lastAnalysis ? (
        <div className="mb-5">
          <AnalysisOutcomeNotice outcome={lastAnalysis} />
        </div>
      ) : null}
      {content}
    </AppShell>
  );
}

/**
 * 이번 결과가 어느 길로 나왔는지 한 줄.
 *
 * 정밀 분석이 실패해도 결과는 온전하므로 사과하지 않는다. 다만 왜 그렇게 됐는지는
 * 말한다 — 화면이 말하지 않으면 사용자는 설정을 켜 둔 것이 소용없다고 여기게 된다.
 */
function AnalysisOutcomeNotice({ outcome }: { outcome: AnalysisOutcome }) {
  if (outcome.usedLlm) {
    const model = outcome.modelId
      ? (findModel(outcome.modelId)?.label ?? outcome.modelId)
      : null;
    return (
      <Callout tone="ok" title="정밀 분석으로 설명과 문장을 다듬었습니다">
        {model ? `${model} 이 문장만 다듬었습니다. ` : ""}
        부문·비중·직무 매칭률은 이 기기의 규칙 엔진이 계산한 값 그대로입니다.
      </Callout>
    );
  }

  return (
    <Callout tone="neutral" title="이 기기 안에서 분석한 결과입니다">
      {outcome.reason ?? "정밀 분석을 쓰지 않았습니다."} 분석 결과는 빠진 것
      없이 그대로 나옵니다.
    </Callout>
  );
}

/** 실행 과제 상태 타입을 화면 밖으로 새어 나가지 않게 다시 내보낸다. */
export type { ActionCard, EnrichmentQuestion };
export { RESUME_VARIANT_META };
