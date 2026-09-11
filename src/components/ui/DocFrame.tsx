/**
 * 문서 틀 — 기획서의 한 쪽을 그대로 옮긴 형태.
 *
 *   eyebrow  03 / CORE RESULT
 *   title    이 팀에, 나는 얼마나 맞을까요?
 *   lead     한 줄 설명
 *   ...본문...
 *   footnote 읽는 법 / 가중값 / 주의
 *
 * 결과 화면은 "앱 화면"이 아니라 "문서"로 읽혀야 신뢰가 생긴다. (기획서 03)
 */
import clsx from "clsx";

export interface DocFrameProps {
  eyebrow?: string;
  title: string;
  lead?: string;
  /** 제목 오른쪽 (판본 전환 등) */
  aside?: React.ReactNode;
  /** 하단 각주 — 읽는 법, 가중값 설명 */
  footnote?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function DocFrame({
  eyebrow,
  title,
  lead,
  aside,
  footnote,
  children,
  className,
}: DocFrameProps) {
  return (
    <section className={clsx("rounded-sm border border-rule bg-canvas", className)}>
      <header className="doc-rule px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
          <div className="min-w-0">
            {eyebrow ? (
              <p className="text-[11px] font-semibold tracking-wide text-brand">{eyebrow}</p>
            ) : null}
            <h2 className="mt-0.5 text-lg leading-tight font-bold text-ink sm:text-xl">{title}</h2>
            {lead ? (
              <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{lead}</p>
            ) : null}
          </div>
          {aside ? <div className="shrink-0">{aside}</div> : null}
        </div>
      </header>

      <div className="px-4 py-4 sm:px-5">{children}</div>

      {footnote ? (
        <footer className="border-t border-rule bg-surface px-4 py-2.5 text-[11px] leading-relaxed text-ink-faint sm:px-5">
          {footnote}
        </footer>
      ) : null}
    </section>
  );
}
