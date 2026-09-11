/**
 * 분석 파이프라인 — 화면(StageId)과 1:1 로 대응하는 단계 함수.
 *
 *   intake   JD 입력 + 내 이력 입력        → stepAnalyzeJD / stepAnalyzeProfile
 *   review   분석 결과 확인                 → (사용자 확인, 계산 없음)
 *   baseline 직접 매핑                      → stepBaseline  → 현재 매칭률 + 이력서 1
 *   story    관련 경험 연결                 → stepStory     → 스토리 후 매칭률 + 이력서 2
 *   plan     남는 차이 → 과제와 목표        → stepPlan      → 목표 매칭률 + 이력서 3(계획)
 *
 * 각 단계는 앞 단계의 결과를 받아 다음을 만든다. 화면은 이 함수들을 그대로 호출하면 된다.
 * 모든 단계는 순수 함수이며 같은 입력이면 같은 출력이다.
 */

import type {
  ActionCard,
  ApplicantProfile,
  EnrichmentQuestion,
  JobPosting,
  Language,
  MatchDimension,
  OverallMatch,
  ResumeDocType,
  ResumeDocument,
  ResumeSet,
  StoryCard,
  StrategyReport,
  TemplateId,
} from "../types";
import { analyzeJobPosting } from "./jd-analyze";
import { analyzeProfile } from "./profile-analyze";
import { buildEnrichmentQuestions, buildReport, type MatchEngineOptions } from "./match";
import { buildResumeSet, type ResumeBuildOptions } from "./resume-build";

export interface PipelineInput {
  jdText: string;
  profileText: string;
  /** 공고를 어디서 가져왔는가 — 분석 자체에는 영향을 주지 않고 출처 표기에만 쓴다. */
  sourceType?: JobPosting["sourceType"];
  sourceUrl?: string;
  /** 지원자 이름 — 본문에서 읽지 못했을 때 사용자가 직접 준 값 */
  name?: string;
  /** 프로필 주소. 내용을 가져오지 못하면 "링크만 저장됨"으로 남는다. (기획서 02) */
  links?: { label: string; url: string }[];
  docType?: ResumeDocType;
  language?: Language;
  templateId?: TemplateId;
  targetPages?: 1 | 2 | 3;
  /** 재직 중 경력의 기준 시점 등 매칭 엔진 옵션 */
  match?: MatchEngineOptions;
}

export interface PipelineResult {
  posting: JobPosting;
  profile: ApplicantProfile;
  report: StrategyReport;
  resumes: ResumeSet;
  questions: EnrichmentQuestion[];
}

function resumeOptions(input: PipelineInput | StageOptions): ResumeBuildOptions {
  return {
    docType: input.docType,
    language: input.language,
    templateId: input.templateId,
    targetPages: input.targetPages,
  };
}

export interface StageOptions {
  docType?: ResumeDocType;
  language?: Language;
  templateId?: TemplateId;
  targetPages?: 1 | 2 | 3;
  match?: MatchEngineOptions;
}

/* ──────────────────────────────────── 1 intake · JD 분석 */

/**
 * 공고 본문을 JobPosting 으로 만든다.
 *
 * 분석 자체는 jd-analyze 가 한다. 여기서는 출처(붙여넣기·URL·파일·샘플)만 덧붙인다 —
 * 분석 함수의 시그니처에 의존하지 않도록 결과를 뒤에서 보정한다.
 */
export function stepAnalyzeJD(
  jdText: string,
  source?: { sourceType?: JobPosting["sourceType"]; sourceUrl?: string },
): JobPosting {
  return analyzeJobPosting({
    rawText: jdText,
    sourceType: source?.sourceType ?? "paste",
    sourceUrl: source?.sourceUrl,
  });
}

/* ──────────────────────────────────── 1 intake · 이력 분석 */

/** 지원자 자료를 ApplicantProfile 로 만든다. 재직 경력에만 한정하지 않는다. (기획서 02) */
export function stepAnalyzeProfile(
  profileText: string,
  extra?: { name?: string; links?: { label: string; url: string }[] },
): ApplicantProfile {
  return analyzeProfile({ rawText: profileText, name: extra?.name, links: extra?.links });
}

/* ──────────────────────────────────── 3 baseline · 직접 매핑 */

export interface BaselineStageResult {
  /** 이 단계에서 만들어진 분석서. 이후 단계는 이것을 그대로 이어 쓴다. */
  report: StrategyReport;
  dimensions: MatchDimension[];
  overall: OverallMatch;
  /** 부족한 부문에 대한 추가 질문 (기획서 05) */
  questions: EnrichmentQuestion[];
  resumes: ResumeSet;
  /** 이력서 1 · Baseline */
  resume: ResumeDocument;
}

/**
 * 내 이력 ↔ requirements 직접 매핑.
 * 이 단계의 수치는 "그 일을 직접 수행한" 근거만으로 계산한 현재 매칭률이다.
 */
export function stepBaseline(
  posting: JobPosting,
  profile: ApplicantProfile,
  options: StageOptions = {},
): BaselineStageResult {
  const report = buildReport(posting, profile, options.match ?? {});
  const questions = buildEnrichmentQuestions(report.dimensions, posting);
  const resumes = buildResumeSet(posting, profile, report, resumeOptions(options));
  return {
    report,
    dimensions: report.dimensions,
    overall: report.overall,
    questions,
    resumes,
    resume: resumes.baseline,
  };
}

/* ──────────────────────────────────── 4 story · 관련 경험 연결 */

export interface StoryStageResult {
  stories: StoryCard[];
  overall: OverallMatch;
  resumes: ResumeSet;
  /** 이력서 2 · 제출용 */
  resume: ResumeDocument;
}

/**
 * 이미 가진 관련 경험까지 연결한 최대치 매핑.
 * 새 사실을 만들지 않는다 — 연결할 실제 경험이 없으면 이 단계에서도 수치는 오르지 않는다.
 */
export function stepStory(
  posting: JobPosting,
  profile: ApplicantProfile,
  report: StrategyReport,
  options: StageOptions = {},
): StoryStageResult {
  const resumes = buildResumeSet(posting, profile, report, resumeOptions(options));
  return {
    stories: report.stories,
    overall: report.overall,
    resumes,
    resume: resumes.story,
  };
}

/* ──────────────────────────────────── 5 plan · 과제와 목표 */

export interface PlanStageResult {
  actions: ActionCard[];
  overall: OverallMatch;
  resumes: ResumeSet;
  /** 이력서 3 · 미래(계획) — 제출 불가 */
  resume: ResumeDocument;
}

/**
 * 남는 차이를 실행 과제와 조건부 목표로 바꾼다.
 * 과제를 체크했다는 것만으로 점수를 주지 않는다 — 재평가는 scoring.reassess 가 증거를 받은 뒤에 한다.
 */
export function stepPlan(
  posting: JobPosting,
  profile: ApplicantProfile,
  report: StrategyReport,
  options: StageOptions = {},
): PlanStageResult {
  const resumes = buildResumeSet(posting, profile, report, resumeOptions(options));
  return {
    actions: report.actions,
    overall: report.overall,
    resumes,
    resume: resumes.future,
  };
}

/* ──────────────────────────────────── 전체 실행 */

/** intake → baseline → story → plan 을 한 번에 돌린다. 화면은 보통 단계 함수를 따로 부른다. */
export function runPipeline(input: PipelineInput): PipelineResult {
  const posting = stepAnalyzeJD(input.jdText, {
    sourceType: input.sourceType,
    sourceUrl: input.sourceUrl,
  });
  const profile = stepAnalyzeProfile(input.profileText, { name: input.name, links: input.links });

  const options: StageOptions = {
    docType: input.docType,
    language: input.language,
    templateId: input.templateId,
    targetPages: input.targetPages,
    match: input.match,
  };

  // story·plan 단계는 baseline 이 만든 분석서를 이어 쓴다. 같은 분석서에서 세 판본이 나온다.
  const baseline = stepBaseline(posting, profile, options);
  const story = stepStory(posting, profile, baseline.report, options);
  const plan = stepPlan(posting, profile, baseline.report, options);

  return {
    posting,
    profile,
    report: baseline.report,
    resumes: {
      baseline: baseline.resume,
      story: story.resume,
      future: plan.resume,
      active: "story",
      submitVariant: "story", // 제출용 기본은 이력서 2
    },
    questions: baseline.questions,
  };
}
