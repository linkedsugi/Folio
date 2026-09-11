/**
 * Word(.docx) 지원전략 분석서 — 결과물 02. (기획서 07)
 *
 * 첫 장은 한눈에 판단하는 요약, 다음 장은 그 판단을 이해하고 실행하는 상세 설명이다.
 *
 *   1 한눈에 보는 요약   인재상 한 문장 · 3단계 매칭 · 부문별 비교표 · 필수 조건 · 우선 행동
 *   2 인재상·매칭 근거   공고의 실제 조건 · 각 부문의 이유 · 관련 경험과 남는 차이
 *   3 지금 지원한다면    합격 가능성 스토리(candidacyNow) — 검토할 이유 / 우려와 답 / 지원할 조건
 *   4 경험 스토리       활용한 경험 · 연결 논리 · 이력서 문장 · 면접 설명
 *   5 실행·목표 계획    목표 문장에서 거꾸로 설계한 과제와 재평가 기준
 *
 * 이 문서는 **지원자 전용**이다. 기업에 제출하는 이력서와 같은 파일로 섞지 않는다.
 * 문서 끝에는 readingNote 와, 수치가 합격확률이 아니라 직무 매칭률이라는 각주를 반드시 남긴다.
 *
 * 이 모듈은 new Date() 를 부르지 않는다.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import {
  MUST_HAVE_STATE_LABEL,
  PRIORITY_LABEL,
  REQUIREMENT_DERIVATION_LABEL,
  RESPONSIBILITY_LEVEL_LABEL,
  STORY_LIFT_LABEL,
  VERDICT_GUIDANCE,
  VERDICT_LABEL,
  type ApplicantProfile,
  type CandidacyCase,
  type JobPosting,
  type MatchDimension,
  type StrategyReport,
} from "@/lib/types";
import { docxPara, docxRun, DOC_INK_MUTED, KO_FONT } from "./docx";
import { MATCH_SCORE_FOOTNOTE } from "./text";

/** 표 머리행 배경. 진한 배경 + 흰 글씨로 머리행을 본문과 분리한다. */
const HEADER_FILL = "1F3A5F";
const HEADER_TEXT = "FFFFFF";
const RULE = "C9D2DC";
/** 지원자 전용 표시색. */
const PRIVATE = "8A5A00";

function pct(value: number): string {
  return `${Math.round(value)}%`;
}

function heading(text: string, level: 1 | 2 | 3): Paragraph {
  const size = level === 1 ? 30 : level === 2 ? 25 : 22;
  return docxPara([docxRun(text, { bold: true, size, color: level === 3 ? DOC_INK_MUTED : HEADER_FILL })], {
    spacing: { before: level === 1 ? 0 : 240, after: 100 },
  });
}

function body(text: string, opts: { bold?: boolean; color?: string; italics?: boolean } = {}): Paragraph {
  return docxPara([docxRun(text, { size: 20, ...opts })], { spacing: { after: 60 } });
}

function bullet(text: string, level = 0): Paragraph {
  return docxPara([docxRun(text, { size: 20 })], { bullet: { level }, spacing: { after: 40 } });
}

function quote(text: string): Paragraph {
  return docxPara([docxRun(text, { size: 20, italics: true, color: DOC_INK_MUTED })], {
    spacing: { after: 80 },
    indent: { left: 240 },
    border: { left: { style: BorderStyle.SINGLE, size: 12, color: RULE, space: 8 } },
  });
}

/* ───────────────────────────────────────────── 부문별 비교표 */

const TABLE_HEAD = [
  "모집팀의 기대",
  "비중",
  "현재",
  "스토리 후",
  "목표",
  "스토리텔링에 활용할 경험",
  "이후 진행할 부분 → 완료 증거",
  "남는 차이",
];
/** 합이 100 이 되게 나눈 열 너비(%). 이름과 설명 칸을 넓게 둔다. */
const TABLE_WIDTHS = [18, 6, 7, 8, 7, 20, 20, 14];

function cell(text: string, opts: { header?: boolean; align?: "left" | "right" } = {}): TableCell {
  return new TableCell({
    shading: opts.header
      ? { type: ShadingType.CLEAR, fill: HEADER_FILL, color: "auto" }
      : undefined,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: [
      new Paragraph({
        alignment: opts.align === "right" ? AlignmentType.RIGHT : AlignmentType.LEFT,
        children: [
          new TextRun({
            text: text || "—",
            font: KO_FONT,
            size: 17,
            bold: opts.header,
            color: opts.header ? HEADER_TEXT : undefined,
          }),
        ],
      }),
    ],
  });
}

function dimensionTable(dimensions: MatchDimension[]): Table {
  const rows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: TABLE_HEAD.map((h) => cell(h, { header: true })),
    }),
  ];

  for (const d of dimensions) {
    rows.push(
      new TableRow({
        children: [
          cell(d.label),
          cell(`${d.weight}%`, { align: "right" }),
          cell(pct(d.current), { align: "right" }),
          cell(pct(d.afterStory), { align: "right" }),
          cell(pct(d.target), { align: "right" }),
          cell(d.storyBasis),
          cell(`${d.nextStep} → ${d.evidenceToProduce}`),
          cell(d.remainingGap),
        ],
      }),
    );
  }

  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: TABLE_WIDTHS,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      left: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      right: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: RULE },
    },
  });
}

function overallTable(report: StrategyReport): Table {
  const head = new TableRow({
    tableHeader: true,
    children: [cell("단계", { header: true }), cell("직무 매칭률", { header: true })],
  });
  const rows = [
    ["현재 — 직접 수행한 사실만", pct(report.overall.display.current)],
    ["스토리텔링 후 — 관련 경험까지 연결", pct(report.overall.display.afterStory)],
    ["목표 — 실행 과제를 마쳤을 때", pct(report.overall.display.target)],
  ].map(([label, value]) => new TableRow({ children: [cell(label), cell(value, { align: "right" })] }));

  return new Table({
    rows: [head, ...rows],
    width: { size: 70, type: WidthType.PERCENTAGE },
    columnWidths: [70, 30],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      left: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      right: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: RULE },
    },
  });
}

/* ───────────────────────────────────────────── 합격 가능성 스토리 */

/**
 * 숫자가 아니라 판단을 적는 부분이다.
 * 우려마다 "그래도 남는 것"(honestLimit)을 반드시 붙인다 — 빠지면 설득이 아니라 변명이 된다.
 */
function candidacySection(c: CandidacyCase, title: string): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [heading(title, 2)];
  out.push(body(c.headline, { bold: true }));

  out.push(heading("이 팀이 나를 검토할 이유", 3));
  out.push(...c.reasonsToConsider.map((r) => bullet(r)));

  out.push(heading("우려와, 내 경험으로 답하는 방법", 3));
  c.concerns.forEach((concern, i) => {
    out.push(body(`${i + 1}. 우려 — ${concern.concern}`, { bold: true }));
    out.push(bullet(`답: ${concern.response}`, 1));
    out.push(bullet(`그래도 남는 것: ${concern.honestLimit}`, 1));
  });

  out.push(heading("지금 지원을 검토할 조건", 3));
  out.push(...c.conditions.map((v) => bullet(v)));

  out.push(quote(c.caution));
  return out;
}

/* ───────────────────────────────────────────── 문서 */

export async function buildReportDocx(
  report: StrategyReport,
  posting: JobPosting,
  profile: ApplicantProfile,
): Promise<Blob> {
  const children: (Paragraph | Table)[] = [];
  const ideal = report.idealCandidate;

  /* 표지 */
  children.push(heading(`지원전략 분석서 — ${posting.company} · ${posting.roleTitle}`, 1));
  children.push(
    body(`지원자 ${profile.name}${posting.team ? ` · 모집팀 ${posting.team}` : ""}`, {
      color: DOC_INK_MUTED,
    }),
  );
  children.push(
    body(
      "지원자 전용 문서입니다. 이 문서의 점수·부족한 부분·면접 메모·미래 계획은 기업 제출용 이력서에 들어가지 않습니다.",
      { bold: true, color: PRIVATE },
    ),
  );

  /* 1 한눈에 보는 요약 */
  children.push(heading("1. 한눈에 보는 요약", 2));

  children.push(heading("모집팀의 인재상", 3));
  children.push(quote(ideal.oneLine));
  children.push(
    body(
      `책임 수준: ${RESPONSIBILITY_LEVEL_LABEL[ideal.responsibilityLevel]} — ${ideal.responsibilityNote}`,
    ),
  );
  if (ideal.coreTasks.length) {
    children.push(body("이 팀이 맡기려는 일"));
    children.push(
      ...ideal.coreTasks.map((t) => bullet(`${t.task} → 기대하는 결과: ${t.expectedOutcome}`)),
    );
  }

  children.push(heading("전체 매칭 3단계", 3));
  children.push(overallTable(report));
  children.push(
    body(
      "스토리텔링 후 값은 이미 가진 경험을 연결해 설명할 수 있는 수준입니다. 문장만 고쳐서는 오르지 않습니다.",
      { color: DOC_INK_MUTED },
    ),
  );

  children.push(heading("부문별 비교표", 3));
  children.push(dimensionTable(report.dimensions));

  children.push(heading("필수 조건 — 총점과 별개의 정보", 3));
  if (report.mustHaveStatus.length === 0) {
    children.push(bullet("공고에서 필수 조건을 찾지 못했습니다. 원문을 다시 확인하세요."));
  } else {
    children.push(
      ...report.mustHaveStatus.map((m) =>
        bullet(`[${MUST_HAVE_STATE_LABEL[m.state]}] ${m.label} — ${m.note}`),
      ),
    );
    children.push(
      body("총점이 높아도 필수 조건이 비어 있으면 다른 판단이 필요합니다. 두 정보를 섞지 마세요.", {
        color: DOC_INK_MUTED,
      }),
    );
  }

  children.push(heading("지금의 지원 판단", 3));
  children.push(body(`${VERDICT_LABEL[report.verdict]} — ${report.verdictNote}`, { bold: true }));
  children.push(body(`안내: ${VERDICT_GUIDANCE[report.verdict]}`));

  const priority = [...report.actions].sort((a, b) => a.priority - b.priority).slice(0, 3);
  if (priority.length) {
    children.push(heading("먼저 할 것", 3));
    children.push(
      ...priority.map((a) => bullet(`[${PRIORITY_LABEL[a.priority]}] ${a.targetSentence}`)),
    );
  }

  /* 2 인재상·매칭 근거 */
  children.push(heading("2. 인재상·매칭 근거", 2));

  children.push(heading("공고의 실제 조건", 3));
  if (posting.requirements.length === 0) {
    children.push(bullet("조건을 찾지 못했습니다. 공고 본문을 다시 확인하세요."));
  }
  for (const r of posting.requirements) {
    children.push(
      bullet(
        `[${r.kind === "must" ? "필수" : "우대"}·${REQUIREMENT_DERIVATION_LABEL[r.derivation]}] ${r.label} — ${r.text}`,
      ),
    );
    // 공고 원문(사실)과 앱의 해석을 같은 무게로 보이게 하지 않는다.
    children.push(bullet(`공고 원문: "${r.sourceQuote}"`, 1));
    if (r.inferenceNote) children.push(bullet(`이렇게 읽은 이유: ${r.inferenceNote}`, 1));
    if (r.equivalence === "unknown") {
      children.push(bullet("동등 경험 인정 여부가 공고에 없습니다. 확인이 필요합니다.", 1));
    }
  }

  children.push(heading("인재상을 이렇게 읽은 근거", 3));
  for (const note of ideal.rationale) {
    children.push(bullet(note.claim));
    for (const e of note.evidence) children.push(bullet(`인용: "${e.quote}"`, 1));
    children.push(bullet(`해석: ${note.interpretation}`, 1));
  }

  children.push(heading("부문별 근거", 3));
  for (const d of report.dimensions) {
    children.push(body(`${d.label} (비중 ${d.weight}%)`, { bold: true }));
    children.push(bullet(`팀의 기대: ${d.teamExpectation}`));
    children.push(bullet(`현재 ${pct(d.current)} 의 근거: ${d.currentBasis}`));
    children.push(bullet(`스토리텔링 후 ${pct(d.afterStory)}: ${d.storyBasis}`));
    // 값이 움직이지 않은 것과 앱이 일을 안 한 것은 다르다.
    children.push(bullet(`스토리텔링에서의 변화: ${STORY_LIFT_LABEL[d.storyLift]}`));
    children.push(bullet(`목표 ${pct(d.target)}: ${d.nextStep} → 완료 증거: ${d.evidenceToProduce}`));
    children.push(bullet(`남는 차이: ${d.remainingGap}`));
    if (d.targetCaveat) children.push(bullet(`주의: ${d.targetCaveat}`));
    if (d.confidence === "needs-confirmation") {
      children.push(bullet("확인 필요: 근거가 부족해 이 값은 확정이 아닙니다."));
    }
    for (const note of d.rationale) {
      children.push(bullet(`근거: ${note.claim} — ${note.interpretation}`, 1));
    }
  }

  /* 3 지금 지원한다면 */
  children.push(...candidacySection(report.candidacyNow, "3. 지금 이력서 2로 지원한다면"));

  /* 4 경험 스토리 */
  children.push(heading("4. 경험 스토리", 2));
  if (report.stories.length === 0) {
    children.push(bullet("연결할 관련 경험을 아직 찾지 못했습니다."));
  }
  for (const s of report.stories) {
    children.push(body(s.teamExpectation, { bold: true }));
    children.push(bullet(`활용한 경험: ${s.usedExperience}`));
    children.push(bullet(`연결 논리: ${s.connectionLogic}`));
    if (s.evidence.length) children.push(bullet(`실제 증거: ${s.evidence.join(" · ")}`));
    children.push(bullet(`이력서 문장: ${s.resumeSentence}`));
    children.push(bullet(`면접 설명: ${s.interviewNote}`));
    // 다른 환경의 성과를 목표 환경의 성과로 바꾸지 않는다.
    children.push(bullet(`보완 범위와 한계: ${s.scopeAndLimit}`));
    children.push(bullet(`이 부문 매칭: ${pct(s.from)} → ${pct(s.to)}`));
  }

  /* 5 실행·목표 계획 */
  children.push(heading("5. 실행·목표 계획", 2));
  children.push(
    body(
      "각 과제는 이력서 3 에 쓰고 싶은 문장에서 거꾸로 설계했습니다. 체크만으로는 목표 점수가 오르지 않으며, 완료 증거를 제출해야 재평가 대상이 됩니다.",
      { color: DOC_INK_MUTED },
    ),
  );
  if (report.actions.length === 0) children.push(bullet("진행할 과제가 없습니다."));
  for (const a of [...report.actions].sort((x, y) => x.priority - y.priority)) {
    children.push(body(`[${PRIORITY_LABEL[a.priority]}] ${a.targetSentence}`, { bold: true }));
    children.push(bullet(`목표 문장(이력서 3 의 [예정] 문장): ${a.targetSentence}`));
    children.push(bullet(`그 문장을 사실로 만들려면: ${a.experienceNeeded}`));
    children.push(bullet(`부족한 기대: ${a.gap}`));
    children.push(bullet(`이 부문 목표: ${pct(a.from)} → ${pct(a.to)}`));
    if (a.actions.length) children.push(bullet(`진행할 일: ${a.actions.join(" · ")}`));
    if (a.evidence.length) children.push(bullet(`완료 증거: ${a.evidence.join(" · ")}`));
    if (a.conditions.length) children.push(bullet(`진행 조건: ${a.conditions.join(" · ")}`));
    children.push(bullet(`재평가 기준: ${a.reassessCriteria}`));
    children.push(
      bullet(
        `상태: ${
          a.status === "evidence-submitted"
            ? "증거 제출됨 — 재평가 대상"
            : a.status === "in-progress"
              ? "진행 중"
              : "시작 전"
        }`,
      ),
    );
  }

  children.push(...candidacySection(report.candidacyFuture, "6. 실행 과제를 마친다면"));

  /* 맺음 — 읽는 법과 각주 */
  children.push(heading("이 문서를 읽는 법", 3));
  children.push(body(report.readingNote));
  children.push(
    docxPara(
      [
        docxRun(`※ ${MATCH_SCORE_FOOTNOTE.replace(/\*\*/g, "")}`, {
          size: 17,
          color: DOC_INK_MUTED,
        }),
      ],
      {
        spacing: { before: 160 },
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 8 } },
      },
    ),
  );
  children.push(
    docxPara(
      [
        docxRun(
          "※ 이력서 3(미래)은 아직 사실이 아닌 [예정] 항목을 담고 있어 기업에 제출할 수 없습니다.",
          { size: 17, color: DOC_INK_MUTED },
        ),
      ],
      { spacing: { after: 0 } },
    ),
  );

  const file = new Document({
    creator: "RoleFit Canvas",
    title: `지원전략 분석서 — ${posting.company} · ${posting.roleTitle}`,
    description: "지원자 전용 · 기업 제출용 아님",
    styles: {
      default: {
        document: {
          run: { font: KO_FONT, size: 20 },
          paragraph: { spacing: { line: 280 } },
        },
      },
    },
    sections: [
      {
        properties: { page: { margin: { top: 720, bottom: 720, left: 640, right: 640 } } },
        children,
      },
    ],
  });

  return Packer.toBlob(file);
}
