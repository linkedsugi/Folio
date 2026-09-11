/**
 * 이력서 렌더링 공용 조각.
 *
 * 템플릿 5종은 "무엇을 어떤 순서로, 어떤 강조로" 보여줄지만 다르다.
 * 사실(기간·직함·문장)은 어느 템플릿에서도 같아야 하므로 여기에 모은다.
 * 템플릿·색·서체 변경은 문서 표현만 바꾼다 — 매칭률과 무관하다. (기획서 09)
 */
import type { ResumeLine, ResumeVariant } from "@/lib/types";

/** 제외된 문장은 화면과 내보내기 양쪽에서 빠진다. */
export function visibleLines(lines: ResumeLine[]): ResumeLine[] {
  return lines.filter((l) => l.status !== "excluded");
}

/** 한 문장이 어떤 근거 위에 서 있는지. 편집 화면에서만 보이고 인쇄물에는 나오지 않는다. */
export function BasisMark({ line }: { line: ResumeLine }) {
  if (line.basis === "direct") return null;
  const isPlanned = line.basis === "planned";
  return (
    <span
      className={[
        "no-print ml-1.5 inline-block shrink-0 rounded-sm px-1 py-px align-middle text-[10px] leading-tight font-medium",
        isPlanned ? "bg-goal-soft text-goal" : "bg-story-soft text-story",
      ].join(" ")}
      title={
        isPlanned
          ? "아직 사실이 아닌 계획 문장입니다. 제출용 문서에는 넣을 수 없습니다."
          : "이미 가진 관련 경험을 이 직무와 연결해 설명한 문장입니다."
      }
    >
      {isPlanned ? "예정" : "연결"}
    </span>
  );
}

/** 인쇄·미리보기 공통 A4 지면. */
export function Sheet({
  children,
  accent,
  className = "",
}: {
  children: React.ReactNode;
  accent: string;
  className?: string;
}) {
  return (
    <div
      className={`print-page mx-auto w-full max-w-[210mm] bg-canvas px-7 py-8 text-[11.5px] leading-[1.65] text-ink shadow-sm ring-1 ring-rule sm:px-10 sm:py-11 sm:text-[12px] ${className}`}
      style={{ ["--accent" as string]: accent }}
    >
      {children}
    </div>
  );
}

/** 섹션 제목 — 템플릿마다 밑줄/색만 달라진다. */
export function SectionHeading({
  children,
  style = "rule",
}: {
  children: React.ReactNode;
  style?: "rule" | "bar" | "caps" | "plain";
}) {
  if (style === "bar") {
    return (
      <h2 className="avoid-break mt-5 mb-2 flex items-center gap-2 text-[12.5px] font-bold tracking-tight">
        <span className="h-3.5 w-1 shrink-0 rounded-sm" style={{ background: "var(--accent)" }} />
        <span style={{ color: "var(--accent)" }}>{children}</span>
      </h2>
    );
  }
  if (style === "caps") {
    return (
      <h2
        className="avoid-break mt-5 mb-2 text-[11px] font-bold tracking-[0.14em] uppercase"
        style={{ color: "var(--accent)" }}
      >
        {children}
      </h2>
    );
  }
  if (style === "plain") {
    return (
      <h2 className="avoid-break mt-5 mb-2 text-[12.5px] font-bold text-ink">{children}</h2>
    );
  }
  return (
    <h2
      className="avoid-break mt-5 mb-2 border-b pb-1 text-[12.5px] font-bold"
      style={{ color: "var(--accent)", borderColor: "var(--accent)" }}
    >
      {children}
    </h2>
  );
}

/** 항목 머리: 기간과 실제 직함은 유지한다. (기획서 08) */
export function EntryHead({
  organization,
  title,
  period,
  meta,
  planned,
}: {
  organization: string;
  title: string;
  period: string;
  meta?: string;
  planned?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[12px] font-bold text-ink">{organization}</span>
        <span className="text-ink-muted">{title}</span>
        {planned ? (
          <span className="rounded-sm bg-goal-soft px-1 text-[10px] font-medium text-goal">
            예정
          </span>
        ) : null}
      </div>
      <span className="tabular shrink-0 text-[11px] text-ink-muted">{period}</span>
      {meta ? <div className="w-full text-[11px] text-ink-faint">{meta}</div> : null}
    </div>
  );
}

/** 문장 목록. onLineClick 이 있으면 편집 가능한 상태로 보인다. */
export function Bullets({
  lines,
  onLineClick,
  activeLineId,
}: {
  lines: ResumeLine[];
  onLineClick?: (line: ResumeLine) => void;
  activeLineId?: string | null;
}) {
  const shown = visibleLines(lines);
  if (shown.length === 0) return null;
  return (
    <ul className="mt-1 space-y-0.5">
      {shown.map((line) => {
        const body = (
          <>
            <span>{line.text}</span>
            <BasisMark line={line} />
          </>
        );
        return (
          <li key={line.id} className="flex gap-1.5">
            <span aria-hidden className="mt-[0.45em] h-1 w-1 shrink-0 rounded-full bg-ink-faint" />
            {onLineClick ? (
              <button
                type="button"
                onClick={() => onLineClick(line)}
                className={[
                  "-mx-1 flex-1 rounded-sm px-1 text-left transition-colors hover:bg-brand-soft",
                  activeLineId === line.id ? "bg-brand-soft ring-1 ring-inset ring-rule-strong" : "",
                ].join(" ")}
              >
                {body}
              </button>
            ) : (
              <span className="flex-1">{body}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** 판본 표시 — 제출 불가 판본은 지면에서도 분명히 구분한다. */
export function VariantWatermark({ variant }: { variant: ResumeVariant }) {
  if (variant !== "future") return null;
  return (
    <div className="avoid-break mb-4 rounded-sm border border-goal-rule bg-goal-soft px-3 py-2 text-[11px] leading-relaxed text-goal">
      <strong className="font-bold">지원자 전용 · 제출용 아님.</strong> 실행 과제를 완료했을 때의
      모습을 미리 보는 자료입니다. <span className="font-medium">[예정]</span> 항목은 아직 사실이
      아니므로 기업에 제출하는 문서에 넣지 않습니다.
    </div>
  );
}
