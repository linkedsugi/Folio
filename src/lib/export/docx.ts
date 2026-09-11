/**
 * Word(.docx) 이력서 내보내기.
 *
 * 여기서 만드는 것은 **기업에 제출하는 문서**다. 그래서 분석서의 내용은 한 줄도 들어가지 않는다.
 * 매칭률·부족한 부분·면접 메모·미래 계획은 ResumeDocument 안(narrative)에 있어도 쓰지 않는다.
 * (기획서 07 "이력서와 분석서는 분리한다")
 *
 * 한글이 깨지지 않도록 기본 스타일과 각 TextRun 에 "맑은 고딕"을 지정한다.
 * Word 는 문서 기본 글꼴만으로는 동아시아 문자에 다른 글꼴을 적용하는 일이 있어서,
 * 실행 단위까지 같은 글꼴을 박아 두는 편이 안전하다.
 *
 * 이 모듈은 new Date() 를 부르지 않는다 — 같은 입력이면 같은 문서가 나와야 한다.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  TextRun,
  type IParagraphOptions,
  type IRunOptions,
} from "docx";
import type { ResumeDocument, ResumeEntry, ResumeLine, TemplateMeta } from "@/lib/types";
import { SECTION_LABEL } from "@/lib/types";
import { FUTURE_WARNING } from "./text";

/** 한글이 깨지지 않는 기본 글꼴. */
export const KO_FONT = "맑은 고딕";

/** 본문 색. 순수한 검정보다 인쇄물에서 눈이 편하다. */
const INK = "1A1A1A";
const INK_MUTED = "555555";
/** 제출 불가 경고색. Word 문서에는 Tailwind 토큰을 쓸 수 없어 문서용 색을 따로 둔다. */
const DANGER = "B32020";

/** 템플릿의 accent(#rrggbb)를 Word 가 읽는 6자리 hex 로. */
function hex(color: string, fallback = "2B6CB0"): string {
  const cleaned = color.replace(/^#/, "").trim();
  return /^[0-9a-fA-F]{6}$/.test(cleaned) ? cleaned.toUpperCase() : fallback;
}

/** 모든 실행에 글꼴을 붙인다. */
function run(text: string, opts: Omit<IRunOptions, "text"> = {}): TextRun {
  return new TextRun({ text, font: KO_FONT, color: INK, ...opts });
}

function para(children: TextRun[], opts: Omit<IParagraphOptions, "children"> = {}): Paragraph {
  return new Paragraph({ children, ...opts });
}

/** 분석서 문서도 같은 글꼴 규칙을 쓴다. 두 벌로 나뉘면 한쪽만 깨진다. */
export { run as docxRun, para as docxPara, hex as toDocxHex, INK as DOC_INK, INK_MUTED as DOC_INK_MUTED };

/* ───────────────────────────────────────────── 이력서 */

function visibleLines(lines: ResumeLine[], variant: ResumeDocument["variant"]): ResumeLine[] {
  // 사용자가 뺀 문장과, 아직 사실이 아닌 계획 문장은 내보내지 않는다.
  return lines.filter(
    (l) => l.status !== "excluded" && (variant === "future" || l.basis !== "planned"),
  );
}

function entryHeadline(entry: ResumeEntry): string {
  return [entry.organization, entry.title, entry.period, entry.meta]
    .map((v) => (v ?? "").trim())
    .filter(Boolean)
    .join("  |  ");
}

/**
 * 이력서 Word 문서.
 *
 * variant === 'future' 여도 던지지 않는다. 사용자가 자기 계획을 파일로 들고 다닐 수는 있어야 한다.
 * 대신 문서를 여는 순간 첫 줄에서 제출용이 아님을 알 수 있게 굵은 경고를 넣는다.
 */
export async function buildResumeDocx(
  doc: ResumeDocument,
  template: TemplateMeta,
): Promise<Blob> {
  const accent = hex(template.accent);
  const children: Paragraph[] = [];

  if (doc.variant === "future") {
    children.push(
      para([run(FUTURE_WARNING, { bold: true, color: DANGER, size: 22 })], {
        spacing: { after: 160 },
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 6, color: DANGER, space: 6 },
        },
      }),
    );
  }

  /* 머리말 — 이름 · 한 줄 소개 · 연락처 */
  children.push(
    para([run(doc.header.name, { bold: true, size: 36 })], { spacing: { after: 40 } }),
  );
  if (doc.header.headline.trim()) {
    children.push(
      para([run(doc.header.headline, { size: 22, color: INK_MUTED })], {
        spacing: { after: 40 },
      }),
    );
  }
  if (doc.header.contactLine.trim()) {
    children.push(
      para([run(doc.header.contactLine, { size: 20, color: INK_MUTED })], {
        spacing: { after: 120 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: accent, space: 8 } },
      }),
    );
  }

  /* 섹션 */
  for (const section of doc.sections) {
    if (!section.included) continue;

    const blocks: Paragraph[] = [];

    for (const line of visibleLines(section.lines, doc.variant)) {
      blocks.push(
        para([run(line.text, { size: 21 })], { spacing: { after: 60 }, alignment: AlignmentType.LEFT }),
      );
    }

    for (const entry of section.entries) {
      if (entry.planned && doc.variant !== "future") continue;
      const lines = visibleLines(entry.lines, doc.variant);
      const headline = entryHeadline(entry);
      if (!headline && lines.length === 0) continue;
      if (headline) {
        // 기간과 실제 직함은 유지한다. (기획서 08)
        blocks.push(
          para([run(headline, { bold: true, size: 21 })], { spacing: { before: 80, after: 40 } }),
        );
      }
      for (const line of lines) {
        blocks.push(
          para([run(line.text, { size: 21 })], {
            bullet: { level: 0 },
            spacing: { after: 40 },
          }),
        );
      }
    }

    if (blocks.length === 0) continue;

    children.push(
      para([run(SECTION_LABEL[section.kind]?.[doc.language] ?? section.heading, {
        bold: true,
        size: 24,
        color: accent,
      })], {
        spacing: { before: 240, after: 80 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: accent, space: 4 } },
      }),
      ...blocks,
    );
  }

  const file = new Document({
    creator: "RoleFit Canvas",
    title: doc.versionLabel,
    description: doc.header.headline,
    styles: {
      default: {
        document: {
          run: { font: KO_FONT, size: 21, color: INK },
          paragraph: { spacing: { line: 280 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } },
        },
        children,
      },
    ],
  });

  return Packer.toBlob(file);
}

/* ───────────────────────────────────────────── 내려받기 */

/**
 * 브라우저에서 파일로 저장한다.
 *
 * file-saver 는 불러오는 순간 window 를 만진다. 모듈 최상단에서 import 하면
 * 서버 렌더링에서 터지므로, 실제로 내려받는 순간에만 동적으로 불러온다.
 */
export async function downloadBlob(blob: Blob, filename: string): Promise<void> {
  const mod: unknown = await import("file-saver");
  const saveAs = resolveSaveAs(mod);
  if (!saveAs) throw new Error("파일 저장 기능을 불러오지 못했습니다.");
  saveAs(blob, filename);
}

type SaveAs = (data: Blob, filename?: string) => void;

/** CJS/ESM 어느 쪽으로 묶이든 saveAs 를 찾아낸다. */
function resolveSaveAs(mod: unknown): SaveAs | null {
  const candidates: unknown[] = [];
  if (mod && typeof mod === "object") {
    const record = mod as Record<string, unknown>;
    candidates.push(record.saveAs, record.default);
    const fallback = record.default;
    if (fallback && typeof fallback === "object") {
      candidates.push((fallback as Record<string, unknown>).saveAs);
    }
  }
  if (typeof mod === "function") candidates.push(mod);
  for (const c of candidates) {
    if (typeof c === "function") return c as SaveAs;
  }
  return null;
}
