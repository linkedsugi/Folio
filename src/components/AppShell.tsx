/**
 * 앱 골격. (기획서 10)
 *
 * 핵심 메뉴는 "지원전략 분석"과 "이력서 작성" 두 개를 중심으로 구성한다.
 * 별도 도구를 계속 이동하게 하기보다 같은 지원 건 안에서 두 결과를 연결한다.
 */
"use client";

import Link from "next/link";
import type { Application, StageId } from "@/lib/types";
import { StageRail } from "@/components/ui";
import { UserMenu } from "@/components/auth/UserMenu";

export function AppShell({
  app,
  stage,
  onStageSelect,
  children,
}: {
  app: Application | null;
  stage: StageId;
  onStageSelect?: (s: StageId) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh">
      <header className="doc-rule sticky top-0 z-20 bg-canvas/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="text-[12px] font-semibold tracking-wide text-brand hover:text-brand-strong"
          >
            MINDCANVAS / ROLEFIT CANVAS
          </Link>

          {app ? (
            <>
              <span aria-hidden className="hidden text-rule-strong sm:inline">
                |
              </span>
              <p className="min-w-0 flex-1 truncate text-[13px] text-ink-muted">
                {/* 지원 건 이름이 이미 "회사 · 직무" 이면 같은 말을 두 번 쓰지 않는다. */}
                <span className="font-medium text-ink">
                  {app.posting ? `${app.posting.company} · ${app.posting.roleTitle}` : app.name}
                </span>
                {app.sampleId ? (
                  <span className="ml-2 rounded-sm bg-surface-sunken px-1.5 py-0.5 text-[11px] font-medium">
                    샘플
                  </span>
                ) : null}
              </p>

              {/* 두 결과물로 바로 이동 — 같은 지원 건 안에서 오간다. */}
              {app.report ? (
                <>
                  <nav aria-label="핵심 메뉴" className="flex shrink-0 gap-2">
                    <TopLink
                      active={stage === "baseline" || stage === "story" || stage === "plan"}
                      onClick={() => onStageSelect?.("story")}
                    >
                      지원전략 분석
                    </TopLink>
                    <TopLink
                      active={stage === "export"}
                      onClick={() => onStageSelect?.("export")}
                    >
                      이력서 작성
                    </TopLink>
                  </nav>
                  {/*
                    계정 영역을 핵심 메뉴 바로 옆에 붙여 두지 않는다.
                    빗나가게 눌러 로그아웃되면, 그 순간 작업 중이던 지원 건을
                    잃었다고 느낀다. 앞의 구분선과 같은 방식으로 갈라 둔다.
                  */}
                  <span aria-hidden className="hidden text-rule-strong sm:inline">
                    |
                  </span>
                </>
              ) : null}
            </>
          ) : (
            <span className="flex-1" />
          )}

          <div className="shrink-0">
            <UserMenu />
          </div>
        </div>
      </header>

      {app ? (
        <div className="border-b border-rule bg-canvas">
          <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
            <StageRail
              current={stage}
              completed={app.completedStages}
              onSelect={onStageSelect}
            />
          </div>
        </div>
      ) : null}

      <main id="main" className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>

      <footer className="border-t border-rule bg-canvas">
        <div className="mx-auto max-w-6xl px-4 py-6 text-[11px] leading-relaxed text-ink-faint sm:px-6">
          <p>
            앱 기획서 v4.0 · 2026.09.11 — 제품명은 가칭입니다. 샘플의 수치·화면·인물·회사는 기획
            설명을 위한 가상 예시이며, 실제 서비스 운영 성과나 합격 예측이 아닙니다.
          </p>
          <p className="mt-1.5">
            지원자 자료와 분석서는 이 브라우저에만 보관되며 기본 비공개입니다.
          </p>
        </div>
      </footer>
    </div>
  );
}

function TopLink({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={[
        // 머리글의 두 메뉴는 화면을 오가는 주 통로다. 손끝으로 눌러도 빗나가지 않게.
        "inline-flex min-h-10 items-center rounded-sm px-3 py-2 text-[13px] font-medium transition-colors",
        active ? "bg-ink text-white" : "text-ink-muted hover:bg-surface-sunken hover:text-ink",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
