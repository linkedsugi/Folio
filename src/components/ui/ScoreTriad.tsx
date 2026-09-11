/**
 * 현재 → 스토리텔링 후 → 실행 목표, 전체 수치 3개. (기획서 03·04)
 *
 * 문구를 여기에 다시 쓰지 않는다. scoring.ts 의 STAGE_META 가 세 단계의
 * 이름·설명·"달라지는 조건"에 대한 유일한 출처이고, 화면은 그것을 읽기만 한다.
 * 같은 말이 두 곳에 있으면 언젠가 서로 달라지기 때문이다.
 *
 * 수치는 "직무 매칭률"이다. 합격확률·서류통과율이 아니다.
 */
import clsx from "clsx";
import { MATCH_STAGES, STAGE_META, type MatchStage } from "@/lib/scoring";
import type { OverallMatch } from "@/lib/types";
import { STAGE_TONE } from "./tone";

export interface ScoreTriadProps {
  overall: OverallMatch;
  /** 지금 화면이 설명하고 있는 단계 — 테두리로 강조한다 */
  active?: MatchStage;
}

export function ScoreTriad({ overall, active }: ScoreTriadProps) {
  return (
    <section
      aria-label="직무 매칭률 3단계"
      className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-0"
    >
      {MATCH_STAGES.map((stage, i) => {
        const meta = STAGE_META[stage];
        const tone = STAGE_TONE[meta.tone];
        const isActive = active === stage;
        const value = overall.display[stage];
        // 현재 대비 차이. 매칭률의 차이이므로 단위는 %p 로 적는다.
        const delta = value - overall.display.current;

        return (
          <div key={stage} className="contents sm:flex sm:min-w-0 sm:flex-1 sm:items-stretch">
            {i > 0 ? (
              <span
                aria-hidden
                className="hidden shrink-0 items-center px-2 text-ink-faint sm:flex"
              >
                →
              </span>
            ) : null}

            <div
              /* 마우스를 올리면 이 단계가 무슨 뜻인지 바로 확인할 수 있게 한다 */
              title={meta.meaning}
              aria-current={isActive ? "true" : undefined}
              className={clsx(
                "min-w-0 flex-1 rounded-sm border-2 bg-canvas px-4 py-3",
                isActive ? tone.border : "border-rule",
              )}
            >
              <p className={clsx("text-[12px] font-semibold", tone.text)}>{meta.title}</p>

              <p className={clsx("tabular mt-0.5 leading-none font-bold", tone.text)}>
                <span className="text-4xl">{value}</span>
                <span className="text-xl">%</span>
              </p>

              <p className="mt-1.5 text-[12px] leading-snug text-ink-muted">{meta.caption}</p>

              {i > 0 ? (
                <p className="tabular mt-0.5 text-[11px] leading-snug text-ink-faint">
                  현재 대비 {delta > 0 ? `+${delta}` : delta}%p
                </p>
              ) : null}

              {/* title 속성은 마우스에만 보인다. 스크린 리더에도 같은 설명을 남긴다. */}
              <span className="sr-only">
                {meta.meaning}. 달라지는 조건: {meta.changesWhen}.
              </span>
            </div>
          </div>
        );
      })}
    </section>
  );
}
