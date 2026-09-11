"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ResumeVariant } from "@/lib/types";
import { RESUME_VARIANT_META } from "@/lib/types";
import { useActiveApplication, useHydrated } from "@/store/app-store";
import { ResumeDocumentView } from "@/components/resume/ResumeDocumentView";
import { ReportView } from "@/components/report/ReportView";

export function PrintClient({ kind }: { kind: "resume" | "report" }) {
  const hydrated = useHydrated();
  const app = useActiveApplication();
  const params = useSearchParams();
  const [printed, setPrinted] = useState(false);

  const variant = (params.get("variant") as ResumeVariant | null) ?? "story";

  // 지면이 그려진 뒤 인쇄 창을 연다. 자동 인쇄는 한 번만 시도하고,
  // 사용자가 취소하면 다시 열지 않는다 — 되풀이되면 성가시기 때문.
  useEffect(() => {
    if (!hydrated || !app || printed) return;
    const t = window.setTimeout(() => {
      setPrinted(true);
      window.print();
    }, 400);
    return () => window.clearTimeout(t);
  }, [hydrated, app, printed]);

  if (!hydrated) {
    return <p className="p-8 text-sm text-ink-muted">지면을 준비하고 있습니다…</p>;
  }
  if (!app) {
    return (
      <p className="p-8 text-sm text-ink-muted">
        인쇄할 지원 건이 없습니다. 앱에서 문서를 먼저 만들어 주세요.
      </p>
    );
  }

  return (
    <main className="bg-surface py-6 print:bg-canvas print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-2 px-4">
        <p className="text-[12px] text-ink-muted">
          인쇄 창에서 <strong className="font-bold text-ink">PDF로 저장</strong>을 선택하세요.
          여백과 배경 그래픽을 켜면 화면과 같게 나옵니다.
        </p>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-sm bg-ink px-3 py-1.5 text-[12px] font-bold text-white"
        >
          다시 인쇄
        </button>
      </div>

      {kind === "resume" ? (
        app.resumes ? (
          <ResumeDocumentView doc={app.resumes[variant]} />
        ) : (
          <p className="p-8 text-sm text-ink-muted">아직 이력서가 만들어지지 않았습니다.</p>
        )
      ) : app.report && app.posting && app.profile ? (
        <div className="print-page mx-auto max-w-[210mm] bg-canvas px-7 py-8 shadow-sm ring-1 ring-rule sm:px-10">
          <ReportView
            report={app.report}
            posting={app.posting}
            profile={app.profile}
            forPrint
          />
        </div>
      ) : (
        <p className="p-8 text-sm text-ink-muted">아직 분석서가 만들어지지 않았습니다.</p>
      )}

      {kind === "resume" && app.resumes && !RESUME_VARIANT_META[variant].submittable ? (
        <p className="no-print mx-auto mt-4 max-w-[210mm] rounded-sm bg-goal-soft px-4 py-2 text-[12px] text-goal">
          이 판본은 제출용이 아닙니다. 본인 준비 계획을 보는 용도로만 인쇄하세요.
        </p>
      ) : null}
    </main>
  );
}
