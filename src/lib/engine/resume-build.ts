/**
 * 이력서 3판본 생성기.
 *
 *   baseline (이력서 1) 직접 수행한 사실만            → current  근거, 제출 가능
 *   story    (이력서 2) 관련 경험까지 연결한 최대치     → afterStory 근거, **실제 제출용 기본**
 *   future   (이력서 3) 실행 과제를 마쳤을 때의 모습    → target  근거, **제출 불가 · [예정] 표시**
 *
 * 이 파일이 지키는 기획 원칙(기획서 06·08·09·14):
 *  - 기간과 실제 직함은 바꾸지 않는다. 학위·수료를 실무 경력으로 옮기지 않는다.
 *  - 논문 상태(게재/게재확정/심사중/프리프린트)는 그대로 표기하고 섞지 않는다.
 *  - 분석서의 점수·약점·미래 계획은 제출용 이력서에 자동으로 넣지 않는다.
 *    (점수 문구는 오직 narrative 에만 두고, 문장(ResumeLine)에는 넣지 않는다)
 *  - 예정된 학위·자격·교육·프로젝트는 완료된 이력서 항목으로 넣지 않는다 → future 에서만 '[예정] '.
 *  - 순수 함수이며 같은 입력이면 같은 출력이다. id 는 내용 해시로 만든다.
 */

import type {
  ApplicantProfile,
  ExperienceItem,
  JobPosting,
  Language,
  MatchDimension,
  ResumeDocType,
  ResumeDocument,
  ResumeEntry,
  ResumeLine,
  ResumeNarrative,
  ResumeSection,
  ResumeSectionKind,
  ResumeSet,
  ResumeVariant,
  StrategyReport,
  TemplateId,
} from "../types";
import {
  EXPERIENCE_KIND_LABEL,
  PUBLICATION_STATUS_LABEL,
  RESUME_VARIANT_META,
  SECTION_LABEL,
} from "../types";
import { getTemplate, sectionAppliesTo } from "../templates";
import { buildEvidenceIndex, keywordsOf, primaryFact, stableId } from "./match";

/* ──────────────────────────────────────────────── 옵션 */

export interface ResumeBuildOptions {
  docType?: ResumeDocType;
  language?: Language;
  templateId?: TemplateId;
  targetPages?: 1 | 2 | 3;
}

/** 미래 판본에서만 쓰는 접두사. 아직 사실이 아닌 항목임을 문장 자체가 밝힌다. */
export const PLANNED_PREFIX = "[예정] ";

/** 영문 판본 안내 — 본문은 번역하지 않고 사용자 확인을 요청한다. */
export const EN_BODY_CAUTION = "영문 본문은 사용자 확인이 필요합니다.";

/* ──────────────────────────────────────────────── 문자열 도구 */

function finishSentence(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return t;
  if (/[.!?…]$/.test(t)) return t;
  return `${t}.`;
}

/** 중복 판정용 정규화 — 공백·문장부호 차이만 다른 문장은 같은 문장으로 본다. */
function normalizeForCompare(text: string): string {
  return text.replace(/[\s.,;:!?·・"'“”‘’()\[\]—–-]/g, "").toLowerCase();
}

function isSameFact(a: string, b: string): boolean {
  const x = normalizeForCompare(a);
  const y = normalizeForCompare(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values));
}

/**
 * 부문 라벨은 공고 문장을 그대로 옮긴 것이라 뒤에 조사가 붙어 있을 수 있다.
 * 문장 안에 넣을 때는 인용부호로 감싸 어색해지지 않게 한다.
 */
function quoted(label: string): string {
  return `\u201c${label.trim()}\u201d`;
}

export function formatPeriod(exp: ExperienceItem, language: Language = "ko"): string {
  const start = exp.start.replace("-", ".");
  const end = exp.end ? exp.end.replace("-", ".") : language === "en" ? "Present" : "현재";
  return `${start}~${end}`;
}

/* ──────────────────────────────────────────────── 섹션 배치 */

/** 배치하려던 섹션이 이 템플릿에 없으면 다음 후보로 내려간다. */
const SECTION_FALLBACK: Record<ResumeSectionKind, ResumeSectionKind[]> = {
  summary: ["summary"],
  experience: ["experience", "projects", "activities"],
  skills: ["skills", "summary"],
  projects: ["projects", "experience", "activities"],
  education: ["education", "activities"],
  research: ["research", "projects", "experience", "activities"],
  publications: ["publications", "research", "projects", "activities"],
  teaching: ["teaching", "experience", "activities"],
  certifications: ["certifications", "education", "activities"],
  activities: ["activities", "projects", "experience"],
};

const TEACHING_HINT = /조교|강의|강사|교육\s*지도|teaching|lecturer|instructor|tutor/i;

/** 경험 종류 → 어느 섹션에 둘 것인가. 문서 유형(resume/cv)에 따라 달라진다. */
function preferredSection(exp: ExperienceItem, docType: ResumeDocType): ResumeSectionKind {
  const teachingish = TEACHING_HINT.test(`${exp.title} ${exp.summary} ${exp.tasks.join(" ")}`);
  if (teachingish && docType === "cv") return "teaching";

  switch (exp.kind) {
    case "job":
    case "internship":
    case "freelance":
      return "experience";
    case "project":
    case "competition":
    case "opensource":
      return "projects";
    case "degree":
    case "course":
      return "education";
    case "research":
      return docType === "cv" ? "research" : "projects";
    case "publication":
      return docType === "cv" ? "publications" : "activities";
    case "certification":
    case "training":
      return "certifications";
    case "volunteer":
    default:
      return "activities";
  }
}

function resolveSection(kind: ResumeSectionKind, available: ResumeSectionKind[]): ResumeSectionKind | null {
  for (const candidate of SECTION_FALLBACK[kind]) {
    if (available.includes(candidate)) return candidate;
  }
  return null;
}

/** 템플릿의 섹션 순서를 문서 유형에 맞게 정리한다. cv 면 연구·논문·교육 섹션을 반드시 둔다. */
function sectionOrderFor(templateId: TemplateId, docType: ResumeDocType): ResumeSectionKind[] {
  const template = getTemplate(templateId);
  const order = template.sectionOrder.filter((k) => sectionAppliesTo(k, docType));
  if (!order.includes("summary")) order.unshift("summary");
  if (docType === "cv") {
    for (const k of ["research", "publications", "teaching"] as ResumeSectionKind[]) {
      if (!order.includes(k)) order.push(k);
    }
  }
  return order;
}

/* ──────────────────────────────────────────────── 작업용 중간 표현 */

interface WorkEntry {
  key: string;
  experienceId?: string;
  organization: string;
  title: string;
  period: string;
  meta?: string;
  section: ResumeSectionKind;
  /** 최신순 정렬용 (YYYY-MM). 예정 항목은 빈 문자열이라 맨 뒤로 간다. */
  sortKey: string;
  planned?: boolean;
  lines: ResumeLine[];
}

interface WorkDoc {
  summary: ResumeLine[];
  skills: ResumeLine[];
  entries: WorkEntry[];
}

interface DocContext {
  posting: JobPosting;
  profile: ApplicantProfile;
  report: StrategyReport;
  docType: ResumeDocType;
  language: Language;
  templateId: TemplateId;
  targetPages: 1 | 2 | 3;
  sectionOrder: ResumeSectionKind[];
  /** 경험 id → 그 경험을 직접 근거로 쓴 부문 중 비중이 가장 큰 것 */
  directDim: Map<string, MatchDimension>;
  /** 경험 id → 관련 근거로 쓴 부문 중 비중이 가장 큰 것 */
  relatedDim: Map<string, MatchDimension>;
  directIds: Set<string>;
  expById: Map<string, ExperienceItem>;
  /** 공고가 분량·언어를 지정해 사용자의 선택을 덮었는가 */
  overriddenByPosting: string[];
  /** 이 공고가 실제로 요구하는 키워드 — 기술 섹션을 여기에 맞춰 추린다 */
  jdKeywords: Set<string>;
}

/** 이 기술이 공고의 요구와 이어지는가. */
function hasJdKeyword(skill: string, jdKeywords: Set<string>): boolean {
  const tokens = keywordsOf(skill);
  for (const t of tokens) if (jdKeywords.has(t)) return true;
  return false;
}

function makeLine(params: {
  experienceId?: string;
  actionCardId?: string;
  basis: ResumeLine["basis"];
  text: string;
  dimensionId?: string;
  jdExpectation?: string;
}): ResumeLine {
  const text = finishSentence(params.text);
  return {
    // id 를 판본이 아니라 "내용"으로 만든다 → 같은 사실은 세 판본에서 같은 id 를 갖고,
    // 사실을 한 번 고치면 rebuildAfterEdit 이 모든 판본에 반영할 수 있다.
    id: stableId("ln", params.experienceId ?? params.actionCardId ?? "free", params.basis, text),
    text,
    original: text,
    experienceId: params.experienceId,
    jdExpectation: params.jdExpectation,
    dimensionId: params.dimensionId,
    status: "adopted",
    basis: params.basis,
    actionCardId: params.actionCardId,
  };
}

/** 분량 목표에 따라 항목당 문장 수를 정한다. */
function maxLinesPerEntry(targetPages: 1 | 2 | 3): number {
  return targetPages === 1 ? 2 : targetPages === 2 ? 3 : 4;
}

/**
 * 항목 옆에 붙는 짧은 표기.
 *
 * 경험의 종류와 논문 상태처럼 "이력의 사실"만 적는다.
 * 책임 수준(단순 참여/독립 수행)은 앱의 해석이고 분석서의 내용이므로 제출 문서에 넣지 않는다.
 * 확인이 필요한 항목이 있다는 사실은 narrative.caution 으로만 알린다. (기획서 07)
 */
function entryMeta(exp: ExperienceItem): string {
  const parts = [EXPERIENCE_KIND_LABEL[exp.kind]];
  // 논문 상태는 반드시 그대로 표기한다. 게재/게재확정/심사중/프리프린트를 섞지 않는다.
  if (exp.publicationStatus) parts.push(PUBLICATION_STATUS_LABEL[exp.publicationStatus]);
  return parts.join(" · ");
}

function makeEntry(exp: ExperienceItem, ctx: DocContext, lines: ResumeLine[]): WorkEntry {
  return {
    key: exp.id,
    experienceId: exp.id,
    organization: exp.organization,
    title: exp.title, // 실제 직함은 바꾸지 않는다
    period: formatPeriod(exp, ctx.language),
    meta: entryMeta(exp),
    section: preferredSection(exp, ctx.docType),
    sortKey: exp.end ?? exp.start,
    lines,
  };
}

/* ──────────────────────────────────────────────── 1. baseline */

/** 직접 근거가 된 경험의, 사실 그대로의 문장들. */
function directLinesFor(exp: ExperienceItem, ctx: DocContext): ResumeLine[] {
  const dim = ctx.directDim.get(exp.id);
  const facts = uniq([...exp.outcomes, ...exp.tasks]).filter(Boolean);
  const picked = facts.slice(0, maxLinesPerEntry(ctx.targetPages));
  const source = picked.length > 0 ? picked : [primaryFact(exp)];
  return source.map((fact) =>
    makeLine({
      experienceId: exp.id,
      basis: "direct",
      text: fact,
      dimensionId: dim?.id,
      jdExpectation: dim?.teamExpectation,
    }),
  );
}

function baselineSummary(ctx: DocContext): ResumeLine[] {
  const lines: ResumeLine[] = [];
  if (ctx.profile.headline.trim()) {
    lines.push(makeLine({ basis: "direct", text: ctx.profile.headline }));
  }
  const labels = ctx.report.dimensions
    .filter((d) => d.current > 0)
    .sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id))
    .slice(0, 3)
    .map((d) => d.label);
  if (labels.length > 0) {
    lines.push(
      makeLine({
        basis: "direct",
        text: `공고의 핵심 요구(${labels.map(quoted).join(", ")})에 직접 대응되는 경험이 있습니다`,
      }),
    );
  }
  return lines;
}

function skillLines(ctx: DocContext, entries: WorkEntry[], includeRelated: boolean): ResumeLine[] {
  const lines: ResumeLine[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!entry.experienceId) continue;
    const exp = ctx.expById.get(entry.experienceId);
    if (!exp) continue;
    const isDirect = ctx.directIds.has(exp.id);
    if (!isDirect && !includeRelated) continue;
    for (const skill of exp.skills) {
      const key = skill.toLowerCase();
      if (seen.has(key)) continue;
      // 이 공고가 요구하지 않는 기술은 넣지 않는다. (기획서 08 "하지 않은 일은 제외")
      if (ctx.jdKeywords.size > 0 && !hasJdKeyword(skill, ctx.jdKeywords)) continue;
      seen.add(key);
      lines.push(
        makeLine({
          experienceId: exp.id,
          basis: isDirect ? "direct" : "related",
          // 키워드 나열이 아니라 "어디서 썼는가"를 함께 적는다. (기획서 08)
          text: `${skill} — ${exp.organization} ${exp.title}에서 사용`,
        }),
      );
      if (lines.length >= 8) return lines;
    }
  }
  return lines;
}

function buildBaselineWork(ctx: DocContext): WorkDoc {
  // current > 0 인 부문에 "직접" 연결된 경험만 고른다.
  const selected: ExperienceItem[] = [];
  for (const exp of ctx.profile.experiences) {
    if (!ctx.directIds.has(exp.id)) continue;
    selected.push(exp);
  }

  const entries = selected.map((exp) => makeEntry(exp, ctx, directLinesFor(exp, ctx)));

  // 학력은 이력서의 기본 구성 요소다. 기간·기관·학위명이라는 사실 그대로 항목만 싣고,
  // 문장(근거)은 붙이지 않는다 — 학위를 실무 수행 근거로 바꾸지 않기 위해서다. (기획서 05)
  for (const exp of ctx.profile.experiences) {
    if (exp.kind !== "degree") continue;
    if (entries.some((e) => e.experienceId === exp.id)) continue;
    entries.push(makeEntry(exp, ctx, []));
  }

  entries.sort((a, b) => b.sortKey.localeCompare(a.sortKey) || a.key.localeCompare(b.key));

  return {
    summary: baselineSummary(ctx),
    skills: skillLines(ctx, entries, false),
    entries,
  };
}

/* ──────────────────────────────────────────────── 2. story */

function storySummary(ctx: DocContext): ResumeLine[] {
  const lines: ResumeLine[] = [];
  if (ctx.profile.headline.trim()) {
    lines.push(makeLine({ basis: "direct", text: ctx.profile.headline }));
  }
  const directLabels = ctx.report.dimensions
    .filter((d) => d.current > 0)
    .sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id))
    .slice(0, 2)
    .map((d) => d.label);
  const storyLabels = ctx.report.stories
    .map((s) => ctx.report.dimensions.find((d) => d.id === s.dimensionId)?.label)
    .filter((v): v is string => Boolean(v))
    .slice(0, 2);

  if (directLabels.length > 0) {
    lines.push(
      makeLine({
        basis: "direct",
        text: `공고의 핵심 요구(${directLabels.map(quoted).join(", ")})에 직접 대응되는 경험이 있습니다`,
      }),
    );
  }
  if (storyLabels.length > 0) {
    const orgs = uniq(
      ctx.report.stories
        .slice(0, 2)
        .map((s) => ctx.expById.get(s.usedExperienceIds[0] ?? "")?.organization)
        .filter((v): v is string => Boolean(v)),
    );
    lines.push(
      makeLine({
        basis: "related",
        text: `${storyLabels.map(quoted).join(", ")} 은 ${
          orgs.join(", ") || "이전 경험"
        }에서 수행한 관련 경험으로 설명할 수 있습니다`,
      }),
    );
  }
  return lines;
}

function extendWithStories(base: WorkDoc, ctx: DocContext): WorkDoc {
  const entries = base.entries.map((e) => ({ ...e, lines: [...e.lines] }));

  for (const story of ctx.report.stories) {
    if (story.adopted === false) continue;
    const expId = story.usedExperienceIds[0];
    if (!expId) continue;
    const exp = ctx.expById.get(expId);
    if (!exp) continue;

    const dim = ctx.report.dimensions.find((d) => d.id === story.dimensionId);
    const line = makeLine({
      experienceId: exp.id,
      basis: "related",
      text: story.resumeSentence,
      dimensionId: story.dimensionId,
      jdExpectation: dim?.teamExpectation ?? story.teamExpectation,
    });

    let entry = entries.find((e) => e.experienceId === exp.id);
    if (!entry) {
      entry = makeEntry(exp, ctx, []);
      entries.push(entry);
    }

    // 이미 같은 사실을 direct 문장으로 쓰고 있으면, 연결 설명이 담긴 story 문장으로 대체한다.
    const dupIndex = entry.lines.findIndex((l) => isSameFact(l.text, line.text));
    if (dupIndex >= 0) {
      entry.lines[dupIndex] = line;
    } else if (!entry.lines.some((l) => l.id === line.id)) {
      entry.lines.push(line);
    }

    // 이야기가 근거로 삼은 나머지 관련 경험도 사실 그대로 함께 싣는다.
    // (연결 설명은 대표 경험 한 건에만 붙이고, 나머지는 원래 사실만 옮긴다)
    for (const otherId of story.usedExperienceIds.slice(1)) {
      const other = ctx.expById.get(otherId);
      if (!other) continue;
      let otherEntry = entries.find((e) => e.experienceId === other.id);
      if (!otherEntry) {
        otherEntry = makeEntry(other, ctx, []);
        entries.push(otherEntry);
      }
      if (otherEntry.lines.length > 0) continue; // 이미 실린 경험이면 문장을 더 늘리지 않는다
      const facts = uniq([...other.outcomes, ...other.tasks]).filter(Boolean);
      const picked = facts.length > 0 ? facts.slice(0, maxLinesPerEntry(ctx.targetPages)) : [primaryFact(other)];
      for (const fact of picked) {
        otherEntry.lines.push(
          makeLine({
            experienceId: other.id,
            basis: "related",
            text: fact,
            dimensionId: story.dimensionId,
            jdExpectation: dim?.teamExpectation ?? story.teamExpectation,
          }),
        );
      }
    }
  }

  entries.sort((a, b) => b.sortKey.localeCompare(a.sortKey) || a.key.localeCompare(b.key));
  return { summary: storySummary(ctx), skills: skillLines(ctx, entries, true), entries };
}

/* ──────────────────────────────────────────────── 3. future */

function extendWithActions(story: WorkDoc, ctx: DocContext): WorkDoc {
  const entries = story.entries.map((e) => ({ ...e, lines: [...e.lines] }));

  for (const action of ctx.report.actions) {
    const dim = ctx.report.dimensions.find((d) => d.id === action.dimensionId);
    if (!dim) continue;

    const plan = action.actions[0] ?? action.gap;
    const evidence = action.evidence[0] ?? dim.evidenceToProduce;
    // 반드시 '[예정] ' 로 시작한다. 점수는 문장에 넣지 않는다(분석서와 이력서를 분리).
    const text = `${PLANNED_PREFIX}${plan.replace(/[.\s]+$/, "")} — 완료 증거: ${evidence}`;
    const line = makeLine({
      actionCardId: action.id,
      basis: "planned",
      text,
      dimensionId: dim.id,
      jdExpectation: dim.teamExpectation,
    });

    // 이미 이 부문과 연결된 항목이 있으면 그 항목에, 없으면 예정 항목을 새로 만든다.
    const host = entries.find(
      (e) => !e.planned && e.experienceId && dim.usedExperienceIds.includes(e.experienceId),
    );
    if (host) {
      if (!host.lines.some((l) => l.id === line.id)) host.lines.push(line);
      continue;
    }

    const key = `planned-${dim.id}`;
    let plannedEntry = entries.find((e) => e.key === key);
    if (!plannedEntry) {
      plannedEntry = {
        key,
        organization: "실행 계획",
        title: `${quoted(dim.label)} 보강`,
        period: "예정",
        meta: "아직 수행하지 않은 계획 항목",
        section: "projects",
        sortKey: "", // 정렬에서 항상 맨 뒤
        planned: true,
        lines: [],
      };
      entries.push(plannedEntry);
    }
    if (!plannedEntry.lines.some((l) => l.id === line.id)) plannedEntry.lines.push(line);
  }

  const summary = [...story.summary];
  if (ctx.report.actions.length > 0) {
    summary.push(
      makeLine({
        basis: "planned",
        text: `${PLANNED_PREFIX}${ctx.report.actions
          .slice(0, 2)
          .map((a) => ctx.report.dimensions.find((d) => d.id === a.dimensionId)?.label)
          .filter((v): v is string => Boolean(v))
          .map(quoted)
          .join(", ")} 보강 과제를 진행할 예정입니다`,
      }),
    );
  }

  entries.sort((a, b) => {
    if (Boolean(a.planned) !== Boolean(b.planned)) return a.planned ? 1 : -1;
    return b.sortKey.localeCompare(a.sortKey) || a.key.localeCompare(b.key);
  });
  return { summary, skills: story.skills, entries };
}

/* ──────────────────────────────────────────────── 4. 섹션 조립 */

function assembleSections(work: WorkDoc, ctx: DocContext): ResumeSection[] {
  const available = ctx.sectionOrder;
  const buckets = new Map<ResumeSectionKind, ResumeEntry[]>();
  for (const kind of available) buckets.set(kind, []);

  for (const entry of work.entries) {
    const target = resolveSection(entry.section, available);
    if (!target) continue; // 둘 곳이 없는 항목은 넣지 않는다(없는 섹션을 지어내지 않는다)
    const resumeEntry: ResumeEntry = {
      id: stableId("ent", ctx.posting.id, entry.key),
      experienceId: entry.experienceId,
      organization: entry.organization,
      title: entry.title,
      period: entry.period,
      meta: entry.meta,
      lines: entry.lines,
      planned: entry.planned,
    };
    buckets.get(target)?.push(resumeEntry);
  }

  return available.map((kind) => {
    const entries = buckets.get(kind) ?? [];
    const lines = kind === "summary" ? work.summary : kind === "skills" ? work.skills : [];
    return {
      id: stableId("sec", ctx.posting.id, kind),
      kind,
      heading: SECTION_LABEL[kind][ctx.language], // 영문은 섹션 제목만 바꾼다. 본문은 번역하지 않는다.
      lines,
      entries,
      included: entries.length > 0 || lines.length > 0,
    };
  });
}

/* ──────────────────────────────────────────────── 5. 판본별 스토리텔링 */

function buildNarrative(variant: ResumeVariant, ctx: DocContext, work: WorkDoc): ResumeNarrative {
  const meta = RESUME_VARIANT_META[variant];
  const stage = meta.matchStage;
  const score = ctx.report.overall.display[stage];
  const dims = [...ctx.report.dimensions].sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));

  const readsAs = dims
    .filter((d) => d[stage] >= 50)
    .slice(0, 4)
    .map((d) => `${d.label}: ${stage === "current" ? d.currentBasis : d.storyBasis}`);

  const remainingGap = dims
    .filter((d) => d[stage] < 75)
    .slice(0, 4)
    .map((d) => `${d.label} — ${d.remainingGap}`);

  const headline =
    variant === "baseline"
      ? `직접 수행한 사실만으로 ${ctx.posting.company} ${ctx.posting.roleTitle} 요구에 대응하는 판본입니다. 직무 매칭률 ${score}%.`
      : variant === "story"
        ? `이미 가진 관련 경험까지 연결해 설명한 제출용 판본입니다. 직무 매칭률 ${score}%.`
        : `실행 과제를 모두 마쳤을 때의 모습을 미리 본 판본입니다. 조건부 목표 매칭률 ${score}%.`;

  const interviewAngle =
    variant === "baseline"
      ? "모든 문장이 직접 수행한 사실이므로, 면접에서는 맡은 범위와 판단 과정을 그대로 설명하면 됩니다."
      : variant === "story"
        ? "연결한 경험은 환경이 다르다는 점을 먼저 밝히고, 공통된 절차와 본인이 내린 판단을 설명합니다."
        : "제출용이 아닙니다. 예정 항목은 면접에서 '완료된 경험'으로 말하지 않습니다.";

  const cautions: string[] = [];
  if (variant === "baseline") {
    cautions.push("관련 경험을 연결한 설명이 빠져 있어 보수적으로 읽힙니다.");
  }
  if (variant === "future") {
    cautions.push(
      `기업에 제출할 수 없습니다. '${PLANNED_PREFIX.trim()}' 문장은 아직 사실이 아니며, 지원자 전용 계획 미리보기입니다.`,
    );
  }
  if (ctx.language === "en") {
    cautions.push(EN_BODY_CAUTION);
  }
  if (ctx.overriddenByPosting.length > 0) {
    cautions.push(`공고가 정한 ${ctx.overriddenByPosting.join("·")}을(를) 우선 적용했습니다.`);
  }
  const unconfirmed = work.entries.filter(
    (e) => e.experienceId && ctx.expById.get(e.experienceId)?.confidence === "needs-confirmation",
  );
  if (unconfirmed.length > 0) {
    cautions.push(`확인이 필요한 항목이 ${unconfirmed.length}건 있습니다. 제출 전에 사실을 확인해 주세요.`);
  }

  return {
    matchScore: score,
    headline,
    readsAs: readsAs.length > 0 ? readsAs : ["아직 이 단계에서 강점으로 읽힐 부문이 확인되지 않았습니다."],
    remainingGap: remainingGap.length > 0 ? remainingGap : ["이 단계에서 확인된 큰 차이는 없습니다."],
    interviewAngle,
    caution: cautions.length > 0 ? cautions.join(" ") : undefined,
  };
}

/* ──────────────────────────────────────────────── 6. 문서 조립 */

function contactLine(profile: ApplicantProfile): string {
  const parts = [profile.contact.email, profile.contact.phone, profile.contact.location].filter(
    (v): v is string => Boolean(v && v.trim()),
  );
  for (const link of profile.links) {
    if (link.url.trim()) parts.push(`${link.label}: ${link.url}`);
  }
  return parts.join(" · ");
}

function buildDocument(variant: ResumeVariant, ctx: DocContext, work: WorkDoc): ResumeDocument {
  return {
    id: stableId(
      "resume",
      ctx.posting.id,
      ctx.profile.id,
      variant,
      ctx.docType,
      ctx.language,
      ctx.templateId,
      String(ctx.targetPages),
    ),
    variant,
    jobPostingId: ctx.posting.id,
    profileId: ctx.profile.id,
    docType: ctx.docType,
    language: ctx.language,
    templateId: ctx.templateId,
    // 지원 회사별 버전을 구분한다. (기획서 09)
    versionLabel: `${ctx.posting.company} · ${ctx.posting.roleTitle} · ${RESUME_VARIANT_META[variant].title}`,
    header: {
      name: ctx.profile.name,
      headline: ctx.profile.headline,
      contactLine: contactLine(ctx.profile),
    },
    sections: assembleSections(work, ctx),
    targetPages: ctx.targetPages,
    factsConfirmed: false, // 사용자가 최종 사실 확인을 해야 true 가 된다
    narrative: buildNarrative(variant, ctx, work),
  };
}

function makeContext(
  posting: JobPosting,
  profile: ApplicantProfile,
  report: StrategyReport,
  opts: ResumeBuildOptions,
): DocContext {
  const rules = posting.documentRules;
  const overriddenByPosting: string[] = [];

  // 공고가 언어·분량을 정했으면 사용자의 선택보다 우선한다. (기획서 08)
  let language: Language = opts.language ?? "ko";
  if (rules?.language && rules.language !== language) {
    language = rules.language;
    overriddenByPosting.push("언어");
  }
  let targetPages: 1 | 2 | 3 = opts.targetPages ?? 2;
  if (rules?.maxPages) {
    const capped = Math.min(3, Math.max(1, Math.floor(rules.maxPages))) as 1 | 2 | 3;
    if (capped !== targetPages) overriddenByPosting.push("분량");
    targetPages = capped;
  }

  const docType: ResumeDocType = opts.docType ?? "resume";
  const templateId: TemplateId = opts.templateId ?? (docType === "cv" ? "academic-cv" : "ats-classic");

  const evidence = buildEvidenceIndex(posting, profile);
  const directDim = new Map<string, MatchDimension>();
  const relatedDim = new Map<string, MatchDimension>();
  const directIds = new Set<string>();

  for (const dim of report.dimensions) {
    const ev = evidence.get(dim.id);
    if (!ev) continue;
    if (dim.current > 0) {
      for (const id of ev.direct) {
        directIds.add(id);
        const prev = directDim.get(id);
        if (!prev || dim.weight > prev.weight) directDim.set(id, dim);
      }
    }
    for (const id of ev.related) {
      const prev = relatedDim.get(id);
      if (!prev || dim.weight > prev.weight) relatedDim.set(id, dim);
    }
  }

  return {
    posting,
    profile,
    report,
    docType,
    language,
    templateId,
    targetPages,
    sectionOrder: sectionOrderFor(templateId, docType),
    directDim,
    relatedDim,
    directIds,
    expById: new Map(profile.experiences.map((e) => [e.id, e])),
    overriddenByPosting,
    jdKeywords: keywordsOf(
      posting.roleTitle,
      ...posting.responsibilities,
      ...posting.requirements.map((r) => `${r.label} ${r.text}`),
      ...report.dimensions.map((d) => `${d.label} ${d.teamExpectation}`),
    ),
  };
}

/**
 * 세 판본을 한 번에 만든다.
 * story 는 baseline 을 확장하고, future 는 story 를 확장한다 — 세 판본이 같은 사실 위에 서게 된다.
 */
export function buildResumeSet(
  posting: JobPosting,
  profile: ApplicantProfile,
  report: StrategyReport,
  opts: ResumeBuildOptions = {},
): ResumeSet {
  const ctx = makeContext(posting, profile, report, opts);

  const baselineWork = buildBaselineWork(ctx);
  const storyWork = extendWithStories(baselineWork, ctx);
  const futureWork = extendWithActions(storyWork, ctx);

  return {
    baseline: buildDocument("baseline", ctx, baselineWork),
    story: buildDocument("story", ctx, storyWork),
    future: buildDocument("future", ctx, futureWork),
    active: "story",
    // 제출용 기본은 이력서 2(story). future 는 타입상으로도 선택할 수 없다.
    submitVariant: "story",
  };
}

/* ──────────────────────────────────────────────── 7. 편집 반영 */

export interface ResumeLinePatch {
  /** 문장 수정 */
  text?: string;
  /** 채택 / 수정 / 제외 */
  status?: ResumeLine["status"];
}

function applyPatch(line: ResumeLine, patch: ResumeLinePatch): ResumeLine {
  const text = patch.text !== undefined ? finishSentence(patch.text) : line.text;
  const status =
    patch.status ??
    (patch.text !== undefined
      ? normalizeForCompare(text) === normalizeForCompare(line.original)
        ? "adopted"
        : "edited"
      : line.status);
  // original 은 "원래 문장"이므로 바꾸지 않는다 — "왜 이 경험을 넣었나요?"에서 비교해 보여준다.
  return { ...line, text, status };
}

function patchDocument(doc: ResumeDocument, lineId: string, patch: ResumeLinePatch): ResumeDocument {
  let touched = false;
  const sections = doc.sections.map((section) => {
    const lines = section.lines.map((l) => {
      if (l.id !== lineId) return l;
      touched = true;
      return applyPatch(l, patch);
    });
    const entries = section.entries.map((entry) => {
      let entryTouched = false;
      const entryLines = entry.lines.map((l) => {
        if (l.id !== lineId) return l;
        touched = true;
        entryTouched = true;
        return applyPatch(l, patch);
      });
      return entryTouched ? { ...entry, lines: entryLines } : entry;
    });
    return { ...section, lines, entries };
  });
  return touched ? { ...doc, sections } : doc;
}

/**
 * 문장 채택·수정·제외를 반영한다.
 *
 * 같은 사실 문장은 세 판본에서 같은 id 를 갖도록 만들어 두었기 때문에,
 * 한 판본에서 틀린 사실을 고치면 나머지 판본에도 같이 반영된다. (기획서 10)
 * 점수는 여기서 바뀌지 않는다 — 재평가는 scoring.reassess 가 증거를 받은 뒤에 한다.
 */
export function rebuildAfterEdit(
  set: ResumeSet,
  variant: ResumeVariant,
  lineId: string,
  patch: ResumeLinePatch,
): ResumeSet {
  return {
    ...set,
    baseline: patchDocument(set.baseline, lineId, patch),
    story: patchDocument(set.story, lineId, patch),
    future: patchDocument(set.future, lineId, patch),
    // variant 는 "사용자가 어느 판본에서 고쳤는가"를 뜻한다. 그 판본을 계속 보고 있게 한다.
    active: variant,
  };
}
