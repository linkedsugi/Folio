/**
 * 이력서 지면 렌더러.
 *
 * 템플릿 5종을 하나의 렌더러로 처리한다. 템플릿이 바꾸는 것은
 *  - 섹션 순서 (TemplateMeta.sectionOrder)
 *  - 제목 스타일과 강조 색
 *  - 요약/역량 블록의 배치
 * 뿐이다. 문장과 사실은 어느 템플릿에서도 같다.
 */
import {
  SECTION_LABEL,
  type ResumeDocument,
  type ResumeLine,
  type ResumeSection,
  type TemplateMeta,
} from "@/lib/types";
import { getTemplate } from "@/lib/templates";
import {
  Bullets,
  EntryHead,
  SectionHeading,
  Sheet,
  VariantWatermark,
  visibleLines,
} from "./ResumeChrome";

/** 템플릿별 제목 스타일. 문서 표현만 바꾼다. */
const HEADING_STYLE: Record<string, "rule" | "bar" | "caps" | "plain"> = {
  "ats-classic": "plain",
  "executive-impact": "rule",
  "technical-evidence": "bar",
  "career-transition": "bar",
  "academic-cv": "caps",
  "custom-upload": "plain",
};

export interface ResumeDocumentViewProps {
  doc: ResumeDocument;
  /** 편집 모드: 문장을 누르면 편집기가 열린다 */
  onLineClick?: (line: ResumeLine, section: ResumeSection) => void;
  activeLineId?: string | null;
}

export function ResumeDocumentView({ doc, onLineClick, activeLineId }: ResumeDocumentViewProps) {
  const template = getTemplate(doc.templateId);
  const headingStyle = HEADING_STYLE[template.id] ?? "plain";

  // 템플릿이 정한 순서대로 정렬하되, 순서에 없는 섹션은 뒤에 붙인다.
  const ordered = [...doc.sections]
    .filter((s) => s.included)
    .sort((a, b) => {
      const ia = template.sectionOrder.indexOf(a.kind);
      const ib = template.sectionOrder.indexOf(b.kind);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });

  return (
    <Sheet accent={template.accent}>
      <VariantWatermark variant={doc.variant} />
      <ResumeHeader doc={doc} template={template} />
      {ordered.map((section) => (
        <SectionBlock
          key={section.id}
          section={section}
          doc={doc}
          headingStyle={headingStyle}
          onLineClick={onLineClick}
          activeLineId={activeLineId}
        />
      ))}
    </Sheet>
  );
}

function ResumeHeader({ doc, template }: { doc: ResumeDocument; template: TemplateMeta }) {
  // Executive Impact 만 이름을 크게 쓴다 — 성과·리더형의 강조점이 사람과 책임이기 때문.
  const big = template.id === "executive-impact";
  return (
    <header
      className="avoid-break border-b pb-3"
      style={{ borderColor: template.id === "ats-classic" ? "var(--color-rule)" : "var(--accent)" }}
    >
      <h1 className={big ? "text-[22px] font-bold tracking-tight" : "text-[19px] font-bold tracking-tight"}>
        {doc.header.name}
      </h1>
      {doc.header.headline ? (
        <p className="mt-0.5 text-[12px] font-medium" style={{ color: "var(--accent)" }}>
          {doc.header.headline}
        </p>
      ) : null}
      {doc.header.contactLine ? (
        <p className="mt-1 text-[11px] text-ink-muted">{doc.header.contactLine}</p>
      ) : null}
    </header>
  );
}

function SectionBlock({
  section,
  doc,
  headingStyle,
  onLineClick,
  activeLineId,
}: {
  section: ResumeSection;
  doc: ResumeDocument;
  headingStyle: "rule" | "bar" | "caps" | "plain";
  onLineClick?: (line: ResumeLine, section: ResumeSection) => void;
  activeLineId?: string | null;
}) {
  const lines = visibleLines(section.lines);
  const entries = section.entries.filter((e) => visibleLines(e.lines).length > 0 || e.organization);
  if (lines.length === 0 && entries.length === 0) return null;

  const heading =
    section.heading || SECTION_LABEL[section.kind][doc.language === "en" ? "en" : "ko"];
  const click = onLineClick ? (line: ResumeLine) => onLineClick(line, section) : undefined;

  // 기술·역량은 한 줄로 이어 붙이면 키워드 나열처럼 보인다.
  // 기획서 08 은 "키워드 나열보다 실제 활용 사례와 연결" 을 요구하므로 문장 형태를 유지한다.
  return (
    <section className="avoid-break">
      <SectionHeading style={headingStyle}>{heading}</SectionHeading>
      {section.kind === "summary" ? (
        <div className="space-y-1">
          {lines.map((line) => (
            <p key={line.id} className="text-[11.5px] leading-relaxed">
              {click ? (
                <button
                  type="button"
                  onClick={() => click(line)}
                  className={`-mx-1 rounded-sm px-1 text-left hover:bg-brand-soft ${
                    activeLineId === line.id ? "bg-brand-soft ring-1 ring-inset ring-rule-strong" : ""
                  }`}
                >
                  {line.text}
                </button>
              ) : (
                line.text
              )}
            </p>
          ))}
        </div>
      ) : (
        <Bullets lines={section.lines} onLineClick={click} activeLineId={activeLineId} />
      )}

      <div className={entries.length > 0 && lines.length > 0 ? "mt-2 space-y-3" : "space-y-3"}>
        {entries.map((entry) => (
          <div key={entry.id} className="avoid-break">
            <EntryHead
              organization={entry.organization}
              title={entry.title}
              period={entry.period}
              meta={entry.meta}
              planned={entry.planned}
            />
            <Bullets lines={entry.lines} onLineClick={click} activeLineId={activeLineId} />
          </div>
        ))}
      </div>
    </section>
  );
}
