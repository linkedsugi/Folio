/**
 * 평문 내보내기.
 *
 *  - resumeToPlainText  : 온라인 지원 폼에 그대로 붙여 넣는 이력서 (기획서 09)
 *  - reportToMarkdown   : 지원전략 분석서 (기획서 07 의 구성 그대로)
 *
 * 두 문서는 끝까지 분리한다. 분석서의 점수·부족한 부분·면접 메모·미래 계획은
 * 기업 제출용 이력서에 들어가지 않는다. 그래서 이력서 평문에는 매칭률을 한 글자도 쓰지 않는다.
 *
 * 이 모듈은 new Date() 를 부르지 않는다 — 같은 입력이면 같은 결과가 나와야 한다.
 */
import {
  MUST_HAVE_STATE_LABEL,
  PRIORITY_LABEL,
  REQUIREMENT_DERIVATION_LABEL,
  RESPONSIBILITY_LEVEL_LABEL,
  RESUME_VARIANT_META,
  SECTION_LABEL,
  STORY_LIFT_LABEL,
  VERDICT_GUIDANCE,
  VERDICT_LABEL,
  type ApplicantProfile,
  type CandidacyCase,
  type JobPosting,
  type ResumeDocument,
  type ResumeEntry,
  type ResumeLine,
  type ResumeSection,
  type ResumeVariant,
  type StrategyReport,
} from "@/lib/types";

/**
 * 이력서 3(미래)은 제출용이 아니다.
 * 평문은 복사·붙여넣기가 너무 쉬워서, 파일을 열자마자 보이는 첫 줄에 경고를 박아 둔다.
 */
export const FUTURE_WARNING = "지원자 전용 · 제출용 아님 · [예정] 항목 포함";

/** 분석서 끝에 붙는 각주. 수치의 뜻을 문서 안에서 못 박아 둔다. */
export const MATCH_SCORE_FOOTNOTE =
  "이 문서의 수치는 공고의 요구와 내 이력을 맞춰 본 **직무 매칭률**입니다. 합격 확률이나 서류 통과율이 아니며, 실제 채용 결과를 예측하지 않습니다.";

/* ───────────────────────────────────────────── 이력서 평문 */

/**
 * 이 판본에서 내보낼 문장만 남긴다.
 *
 *  - status==='excluded' : 사용자가 빼기로 한 문장
 *  - basis==='planned'   : 아직 사실이 아닌 계획. 이력서 1·2 에는 절대 들어가면 안 된다.
 *    (데이터가 잘못 섞여 들어와도 내보내기에서 한 번 더 막는다)
 */
function visibleLines(lines: ResumeLine[], variant: ResumeVariant): ResumeLine[] {
  return lines.filter(
    (line) =>
      line.status !== "excluded" && (variant === "future" || line.basis !== "planned"),
  );
}

/** "조직 | 직함 | 기간" — 기간과 실제 직함은 유지하고 바꾸지 않는다. (기획서 08) */
function entryHeadline(entry: ResumeEntry): string {
  return [entry.organization, entry.title, entry.period, entry.meta]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" | ");
}

function sectionHeading(section: ResumeSection, doc: ResumeDocument): string {
  // 섹션 제목은 문서 언어를 따른다. 본문은 번역하지 않는다.
  return SECTION_LABEL[section.kind]?.[doc.language] ?? section.heading;
}

/** 온라인 지원 폼에 붙여 넣을 평문 이력서. */
export function resumeToPlainText(doc: ResumeDocument): string {
  const blocks: string[] = [];

  const head = [doc.header.name, doc.header.headline, doc.header.contactLine]
    .map((v) => v.trim())
    .filter(Boolean);
  if (doc.variant === "future") head.push(FUTURE_WARNING);
  if (head.length) blocks.push(head.join("\n"));

  for (const section of doc.sections) {
    if (!section.included) continue;

    const body: string[] = [];

    for (const line of visibleLines(section.lines, doc.variant)) {
      body.push(line.text.trim());
    }

    for (const entry of section.entries) {
      // 예정 항목은 이력서 3 에만 존재한다.
      if (entry.planned && doc.variant !== "future") continue;
      const lines = visibleLines(entry.lines, doc.variant);
      const headline = entryHeadline(entry);
      // 문장을 모두 뺐어도 항목 머리는 남긴다 — 재직 기간은 사실이고, 빠지면 연대기에 구멍이 생긴다.
      if (!headline && lines.length === 0) continue;
      if (headline) body.push(headline);
      for (const line of lines) body.push(`- ${line.text.trim()}`);
    }

    if (body.length === 0) continue;
    blocks.push([sectionHeading(section, doc), ...body].join("\n"));
  }

  return blocks.join("\n\n").replace(/[ \t]+$/gm, "").trim();
}

/* ───────────────────────────────────────────── 분석서 마크다운 */

/** 표 칸 안의 파이프·줄바꿈은 표를 깨뜨린다. */
function cell(value: string | number | undefined): string {
  const text = String(value ?? "").trim();
  if (!text) return "—";
  return text.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
}

function pct(value: number): string {
  return `${Math.round(value)}%`;
}

function bullets(items: string[], marker = "-"): string[] {
  return items.map((item) => `${marker} ${item.trim()}`).filter((l) => l.length > 2);
}

/** 합격 가능성 스토리 — 숫자가 아니라 판단이다. 우려에는 반드시 "그래도 남는 것"이 따라붙는다. */
function candidacyBlock(c: CandidacyCase, heading: string): string[] {
  const out: string[] = [`## ${heading}`, "", `**${c.headline}**`, ""];

  out.push("### 이 팀이 나를 검토할 이유", "");
  out.push(...bullets(c.reasonsToConsider), "");

  out.push("### 우려와, 내 경험으로 답하는 방법", "");
  c.concerns.forEach((concern, i) => {
    out.push(`${i + 1}. **우려** ${concern.concern}`);
    out.push(`   - 답: ${concern.response}`);
    // 이 줄을 빼면 설득이 아니라 변명이 된다.
    out.push(`   - 그래도 남는 것: ${concern.honestLimit}`);
  });
  out.push("");

  out.push("### 지금 지원을 검토할 조건", "");
  out.push(...bullets(c.conditions), "");

  out.push(`> ${c.caution}`, "");
  return out;
}

/**
 * 지원전략 분석서 (기획서 07).
 *
 *   1 한눈에 보는 요약      인재상 한 문장 · 3단계 매칭 · 부문별 비교표 · 필수 조건 · 우선 행동
 *   2 인재상·매칭 근거      JD 의 실제 조건 · 각 부문의 이유 · 관련 경험과 남는 차이
 *   3 지금 지원한다면       합격 가능성 스토리(candidacyNow)
 *   4 경험 스토리          활용한 경험 · 연결 논리 · 이력서 문장 · 면접 설명
 *   5 실행·목표 계획       목표 문장에서 거꾸로 설계한 과제와 재평가 기준
 *
 * 3 을 따로 둔 이유: 이력서 3 이 완성될 때까지 지원을 미루지 않게 하려는 것이다.
 * 지금의 지원 논리는 그 자체로 하나의 결과다.
 */
export function reportToMarkdown(
  report: StrategyReport,
  posting: JobPosting,
  profile: ApplicantProfile,
): string {
  const out: string[] = [];
  const ideal = report.idealCandidate;

  /* 표지 */
  out.push(`# 지원전략 분석서 — ${posting.company} · ${posting.roleTitle}`, "");
  out.push(
    `지원자: ${profile.name}${posting.team ? ` · 모집팀: ${posting.team}` : ""}`,
    "",
    "지원자 전용 문서입니다. 이 문서의 점수·부족한 부분·면접 메모·미래 계획은 기업 제출용 이력서에 들어가지 않습니다.",
    "",
  );

  /* 1 한눈에 보는 요약 */
  out.push("## 1. 한눈에 보는 요약", "");

  out.push("### 모집팀의 인재상", "", `> ${ideal.oneLine}`, "");
  out.push(
    `책임 수준: **${RESPONSIBILITY_LEVEL_LABEL[ideal.responsibilityLevel]}** — ${ideal.responsibilityNote}`,
    "",
  );
  if (ideal.coreTasks.length) {
    out.push("이 팀이 맡기려는 일", "");
    out.push(
      ...ideal.coreTasks.map((t) => `- ${t.task} → 기대하는 결과: ${t.expectedOutcome}`),
      "",
    );
  }

  out.push("### 전체 매칭 3단계", "");
  out.push("| 단계 | 직무 매칭률 |", "| --- | --- |");
  out.push(`| 현재 — 직접 수행한 사실만 | ${pct(report.overall.display.current)} |`);
  out.push(`| 스토리텔링 후 — 관련 경험까지 연결 | ${pct(report.overall.display.afterStory)} |`);
  out.push(`| 목표 — 실행 과제를 마쳤을 때 | ${pct(report.overall.display.target)} |`, "");
  out.push(
    "스토리텔링 후 값은 이미 가진 경험을 연결해 설명할 수 있는 수준입니다. 문장만 고쳐서는 오르지 않습니다.",
    "",
  );

  out.push("### 부문별 비교표", "");
  out.push(
    "| 모집팀의 기대 | 비중 | 현재 | 스토리 후 | 목표 | 스토리텔링에 활용할 경험 | 이후 진행할 부분 → 완료 증거 | 남는 차이 |",
    "| --- | ---: | ---: | ---: | ---: | --- | --- | --- |",
  );
  for (const d of report.dimensions) {
    out.push(
      `| ${cell(d.label)} | ${d.weight}% | ${pct(d.current)} | ${pct(d.afterStory)} | ${pct(
        d.target,
      )} | ${cell(d.storyBasis)} | ${cell(d.nextStep)} → ${cell(d.evidenceToProduce)} | ${cell(
        d.remainingGap,
      )} |`,
    );
  }
  out.push("");

  out.push("### 필수 조건 — 총점과 별개의 정보", "");
  if (report.mustHaveStatus.length === 0) {
    out.push("- 공고에서 필수 조건을 찾지 못했습니다. 원문을 다시 확인하세요.", "");
  } else {
    out.push(
      ...report.mustHaveStatus.map(
        (m) => `- **[${MUST_HAVE_STATE_LABEL[m.state]}]** ${m.label} — ${m.note}`,
      ),
      "",
      "총점이 높아도 필수 조건이 비어 있으면 다른 판단이 필요합니다. 두 정보를 섞지 마세요.",
      "",
    );
  }

  out.push("### 지금의 지원 판단", "");
  out.push(`**${VERDICT_LABEL[report.verdict]}** — ${report.verdictNote}`, "");
  out.push(`안내: ${VERDICT_GUIDANCE[report.verdict]}`, "");

  const priority = [...report.actions].sort((a, b) => a.priority - b.priority).slice(0, 3);
  if (priority.length) {
    out.push("### 먼저 할 것", "");
    out.push(
      ...priority.map((a) => `- **${PRIORITY_LABEL[a.priority]}** ${a.targetSentence}`),
      "",
    );
  }

  /* 2 인재상·매칭 근거 */
  out.push("## 2. 인재상·매칭 근거", "");

  out.push("### 공고의 실제 조건", "");
  if (posting.requirements.length === 0) {
    out.push("- 조건을 찾지 못했습니다. 공고 본문을 다시 확인하세요.", "");
  } else {
    for (const r of posting.requirements) {
      out.push(
        `- **[${r.kind === "must" ? "필수" : "우대"}·${REQUIREMENT_DERIVATION_LABEL[r.derivation]}]** ${r.label} — ${r.text}`,
      );
      // 사실(공고 원문)과 앱의 해석을 같은 무게로 보이게 하지 않는다.
      out.push(`  - 공고 원문: "${r.sourceQuote}"`);
      if (r.inferenceNote) out.push(`  - 이렇게 읽은 이유: ${r.inferenceNote}`);
      if (r.equivalence === "unknown") {
        out.push("  - 동등 경험 인정 여부가 공고에 없습니다. 확인이 필요합니다.");
      }
    }
    out.push("");
  }

  out.push("### 인재상을 이렇게 읽은 근거", "");
  for (const note of ideal.rationale) {
    out.push(`- ${note.claim}`);
    for (const e of note.evidence) out.push(`  - 인용: "${e.quote}"`);
    out.push(`  - 해석: ${note.interpretation}`);
  }
  out.push("");

  out.push("### 부문별 근거", "");
  for (const d of report.dimensions) {
    out.push(`#### ${d.label} (비중 ${d.weight}%)`, "");
    out.push(`- 팀의 기대: ${d.teamExpectation}`);
    out.push(`- 현재 ${pct(d.current)} 의 근거: ${d.currentBasis}`);
    out.push(`- 스토리텔링 후 ${pct(d.afterStory)}: ${d.storyBasis}`);
    // 값이 움직이지 않은 것과 앱이 일을 안 한 것은 다르다. 이유를 남긴다.
    out.push(`- 스토리텔링에서의 변화: ${STORY_LIFT_LABEL[d.storyLift]}`);
    out.push(`- 목표 ${pct(d.target)}: ${d.nextStep} → 완료 증거: ${d.evidenceToProduce}`);
    out.push(`- 남는 차이: ${d.remainingGap}`);
    if (d.targetCaveat) out.push(`- 주의: ${d.targetCaveat}`);
    if (d.confidence === "needs-confirmation") {
      out.push("- 확인 필요: 근거가 부족해 이 값은 확정이 아닙니다.");
    }
    for (const note of d.rationale) {
      out.push(`- 근거: ${note.claim} — ${note.interpretation}`);
    }
    out.push("");
  }

  /* 3 지금 지원한다면 */
  out.push(...candidacyBlock(report.candidacyNow, "3. 지금 이력서 2로 지원한다면"));

  /* 4 경험 스토리 */
  out.push("## 4. 경험 스토리", "");
  if (report.stories.length === 0) {
    out.push("- 연결할 관련 경험을 아직 찾지 못했습니다.", "");
  }
  for (const s of report.stories) {
    out.push(`### ${s.teamExpectation}`, "");
    out.push(`- 활용한 경험: ${s.usedExperience}`);
    out.push(`- 연결 논리: ${s.connectionLogic}`);
    if (s.evidence.length) out.push(`- 실제 증거: ${s.evidence.join(" · ")}`);
    out.push(`- 이력서 문장: ${s.resumeSentence}`);
    out.push(`- 면접 설명: ${s.interviewNote}`);
    // 다른 환경의 성과를 목표 환경의 성과로 바꾸지 않는다.
    out.push(`- 보완 범위와 한계: ${s.scopeAndLimit}`);
    out.push(`- 이 부문 매칭: ${pct(s.from)} → ${pct(s.to)}${s.adopted ? " (채택함)" : ""}`, "");
  }

  /* 5 실행·목표 계획 */
  out.push("## 5. 실행·목표 계획", "");
  out.push(
    "각 과제는 **이력서 3 에 쓰고 싶은 문장**에서 거꾸로 설계했습니다. 체크만으로는 목표 점수가 오르지 않으며, 완료 증거를 제출해야 재평가 대상이 됩니다.",
    "",
  );
  if (report.actions.length === 0) {
    out.push("- 진행할 과제가 없습니다.", "");
  }
  for (const a of [...report.actions].sort((x, y) => x.priority - y.priority)) {
    out.push(`### [${PRIORITY_LABEL[a.priority]}] ${a.targetSentence}`, "");
    out.push(`- 목표 문장(이력서 3 의 [예정] 문장): ${a.targetSentence}`);
    out.push(`- 그 문장을 사실로 만들려면: ${a.experienceNeeded}`);
    out.push(`- 부족한 기대: ${a.gap}`);
    out.push(`- 이 부문 목표: ${pct(a.from)} → ${pct(a.to)}`);
    if (a.actions.length) out.push(`- 진행할 일: ${a.actions.join(" · ")}`);
    if (a.evidence.length) out.push(`- 완료 증거: ${a.evidence.join(" · ")}`);
    if (a.conditions.length) out.push(`- 진행 조건: ${a.conditions.join(" · ")}`);
    out.push(`- 재평가 기준: ${a.reassessCriteria}`);
    out.push(
      `- 상태: ${
        a.status === "evidence-submitted"
          ? "증거 제출됨 — 재평가 대상"
          : a.status === "in-progress"
            ? "진행 중"
            : "시작 전"
      }`,
      "",
    );
  }

  out.push(...candidacyBlock(report.candidacyFuture, "6. 실행 과제를 마친다면"));

  /* 맺음 */
  out.push("---", "");
  out.push(report.readingNote, "");
  out.push(`※ ${MATCH_SCORE_FOOTNOTE}`, "");
  out.push(
    `※ 이력서 3(${RESUME_VARIANT_META.future.title})은 아직 사실이 아닌 [예정] 항목을 담고 있어 기업에 제출할 수 없습니다.`,
    "",
  );

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
