/**
 * 정밀 분석 — 규칙 기반 결과를 **보강**한다.
 *
 * ── 왜 대체하지 않는가 ────────────────────────────────────────
 * 규칙 엔진이 만든 구조(부문·가중치·점수·판정)는 그대로 두고, 모델은 설명과 문장만
 * 좋게 만든다. 이유는 두 가지다.
 *
 *   1. 모델이 실패해도 결과가 온전하다. 문장이 덜 다듬어졌을 뿐,
 *      사용자는 여전히 완전한 분석서를 본다.
 *   2. 같은 이력이면 같은 점수가 나온다. 숫자가 호출마다 흔들리면
 *      "직무 매칭률"은 근거가 아니라 인상이 된다.
 *
 * 그래서 모델 응답에서 점수는 아예 읽지 않는다. 보내와도 무시한다.
 *
 * ── 왜 목록을 통째로 바꾸지 않는가 ────────────────────────────
 * 우려·검토할 이유·지원 조건 같은 목록은 **자리(index)별 문장 교체만** 허용한다.
 * 모델이 보낸 배열로 원본 배열을 갈아 끼우면, 모델이 두 개 중 하나만 보내거나
 * 한 항목이 검증에서 탈락하는 것만으로 규칙 엔진이 찾아낸 우려가 조용히 사라진다.
 * 항목이 사라지는 것은 문장을 다듬는 일이 아니라 구조를 바꾸는 일이다.
 * 그래서 개수는 항상 원본 그대로이고, 모델이 덜 보내면 남은 자리는 원본이 남는다.
 *
 * ── 무엇을 버리는가 ───────────────────────────────────────────
 * 입력에 없는 id, 빈 문장, 500자를 넘는 문장, 한계를 빼먹은 우려, 근거가 없는 우려,
 * 확률로 말하는 문장. 하나라도 걸리면 **그 자리만** 규칙 기반 값을 유지한다.
 * 전부 버려도 분석서는 멀쩡하다 — 그게 이 설계의 핵심이다.
 */
import type {
  ApplicantProfile,
  CandidacyCase,
  CandidacyConcern,
  JobPosting,
  MatchDimension,
  StoryCard,
  StrategyReport,
} from "../types";
import { callJson, type LlmFailure } from "./client";
import { ENRICH_SYSTEM_PROMPT, buildEnrichUserPrompt } from "./prompts";

/** 이력서 한 문장·설명 한 칸의 상한. 이보다 길면 화면이 아니라 벽이 된다. */
export const MAX_TEXT_LENGTH = 500;

/**
 * 확률로 말하는 표현.
 *
 * 이 앱의 수치는 "직무 매칭률"이다. 합격 여부는 모집팀이 정하고, 앱은 그것을
 * 알 수 없다. 모델이 "합격 확률 72%" 같은 말을 돌려주면 그 문장은 버린다.
 * 한 번 화면에 나가면 사용자는 그 숫자를 믿어 버리기 때문이다.
 */
export const PROBABILITY_PATTERN =
  /(합격\s*(확률|률|가능성|예측)|불합격\s*확률|서류\s*(통과|합격)\s*(율|률|확률)|통과\s*(율|률)|채용\s*확률|\d+\s*%\s*(의\s*)?(확률|가능성)|확률\s*(은|는)?\s*\d+\s*%|pass\s*rate|acceptance\s*rate)/i;

export function containsProbabilityClaim(text: string): boolean {
  return PROBABILITY_PATTERN.test(text);
}

/* ─────────────────────────────────────── 모델 응답의 모양 */

export interface DimensionPatch {
  id: string;
  currentBasis?: string;
  storyBasis?: string;
  remainingGap?: string;
}

export interface StoryPatch {
  id: string;
  connectionLogic?: string;
  resumeSentence?: string;
  interviewNote?: string;
  // scopeAndLimit 은 일부러 없다. 규칙 엔진이 숫자를 조립한 문장이라 모델이 쓰면 안 된다.
}

export interface ConcernPatch {
  concern?: string;
  response?: string;
  honestLimit?: string;
  evidenceIds?: string[];
}

export interface CandidacyPatch {
  headline?: string;
  reasonsToConsider?: string[];
  concerns?: ConcernPatch[];
  conditions?: string[];
}

export interface EnrichPatch {
  idealCandidateOneLine?: string;
  dimensions?: DimensionPatch[];
  stories?: StoryPatch[];
  candidacyNow?: CandidacyPatch;
  candidacyFuture?: CandidacyPatch;
}

/* ─────────────────────────────────────── 값 다듬기 */

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((v): v is string => typeof v === "string");
}

/**
 * 쓸 수 있는 문장인가. 아니면 null 을 주고 호출부가 원래 값을 유지한다.
 * 빈 문장·지나치게 긴 문장·확률 표현은 여기서 한 번에 막는다.
 */
function usable(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (text.length === 0) return null;
  if (text.length > MAX_TEXT_LENGTH) return null;
  if (containsProbabilityClaim(text)) return null;
  return text;
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/* ─────────────────────────────────────── 응답 검증 (모양) */

function parseCandidacy(value: unknown): CandidacyPatch | undefined {
  const raw = asRecord(value);
  if (!raw) return undefined;

  const concernsRaw = Array.isArray(raw.concerns) ? raw.concerns : undefined;
  /*
   * 우려는 자리(index)로 맞춰 넣으므로, 모양이 아닌 항목도 빈 패치로 자리를 지킨다.
   * 여기서 걸러 내면 뒤의 항목이 앞으로 당겨져 엉뚱한 우려에 다른 답이 붙는다.
   * 빈 패치는 어차피 적용 단계에서 통과하지 못하고 원본이 남는다.
   */
  const concerns = concernsRaw?.map((entry): ConcernPatch => {
    const c = asRecord(entry);
    if (!c) return {};
    return {
      concern: asString(c.concern),
      response: asString(c.response),
      honestLimit: asString(c.honestLimit),
      evidenceIds: asStringArray(c.evidenceIds),
    };
  });

  const patch: CandidacyPatch = {
    headline: asString(raw.headline),
    reasonsToConsider: asStringArray(raw.reasonsToConsider),
    concerns,
    conditions: asStringArray(raw.conditions),
  };

  const hasAny =
    patch.headline !== undefined ||
    patch.reasonsToConsider !== undefined ||
    patch.concerns !== undefined ||
    patch.conditions !== undefined;
  return hasAny ? patch : undefined;
}

/**
 * 모델이 준 값이 우리가 아는 모양인지만 본다.
 * id 가 실제로 존재하는지, 문장이 쓸 만한지는 applyEnrichment 가 따로 본다.
 *
 * 쓸 만한 항목이 하나도 없으면 null 을 준다 — 그래야 callJson 이 'bad-response' 로
 * 돌려주고, 화면이 "결과를 읽을 수 없었다"고 정확히 말할 수 있다.
 */
export function validateEnrichPatch(value: unknown): EnrichPatch | null {
  const raw = asRecord(value);
  if (!raw) return null;

  const dimensions = Array.isArray(raw.dimensions)
    ? raw.dimensions
        .map((entry): DimensionPatch | null => {
          const d = asRecord(entry);
          const id = d ? asString(d.id) : undefined;
          if (!d || !id) return null;
          return {
            id,
            currentBasis: asString(d.currentBasis),
            storyBasis: asString(d.storyBasis),
            remainingGap: asString(d.remainingGap),
          };
        })
        .filter((d): d is DimensionPatch => d !== null)
    : undefined;

  const stories = Array.isArray(raw.stories)
    ? raw.stories
        .map((entry): StoryPatch | null => {
          const s = asRecord(entry);
          const id = s ? asString(s.id) : undefined;
          if (!s || !id) return null;
          return {
            id,
            connectionLogic: asString(s.connectionLogic),
            resumeSentence: asString(s.resumeSentence),
            interviewNote: asString(s.interviewNote),
          };
        })
        .filter((s): s is StoryPatch => s !== null)
    : undefined;

  const patch: EnrichPatch = {
    idealCandidateOneLine: asString(raw.idealCandidateOneLine),
    dimensions,
    stories,
    candidacyNow: parseCandidacy(raw.candidacyNow),
    candidacyFuture: parseCandidacy(raw.candidacyFuture),
  };

  const hasAny =
    patch.idealCandidateOneLine !== undefined ||
    (patch.dimensions?.length ?? 0) > 0 ||
    (patch.stories?.length ?? 0) > 0 ||
    patch.candidacyNow !== undefined ||
    patch.candidacyFuture !== undefined;
  return hasAny ? patch : null;
}

/* ─────────────────────────────────────── 응답 적용 (사실 확인) */

/**
 * 바뀐 자리의 경로.
 *
 * 화면이 "정밀 분석이 다듬은 문장"만 짚어 원문과 나란히 보여줄 수 있어야 하므로,
 * 몇 개가 바뀌었는지가 아니라 **어디가** 바뀌었는지를 돌려준다.
 * 예: 'dimension:dim-1x9xkif:storyBasis', 'candidacyNow:concerns:1:response'
 */
interface Applied<T> {
  value: T;
  changedPaths: string[];
}

/**
 * 문장 목록을 자리별로 교체한다. 개수는 원본 그대로다.
 * 모델이 적게 보내면 남은 자리는 원본, 더 보내면 남는 것은 버린다.
 */
function applyTextList(
  original: string[],
  patch: string[] | undefined,
  pathPrefix: string,
): Applied<string[]> {
  if (!patch) return { value: original, changedPaths: [] };

  const changedPaths: string[] = [];
  const value = original.map((current, index) => {
    const next = usable(patch[index]);
    // 같은 문장이면 바꾼 것이 아니다. 화면이 "다듬어졌다"고 표시할 이유가 없다.
    if (!next || next === current) return current;
    changedPaths.push(`${pathPrefix}:${index}`);
    return next;
  });

  return { value, changedPaths };
}

function applyDimensions(
  dimensions: MatchDimension[],
  patches: DimensionPatch[] | undefined,
): Applied<MatchDimension[]> {
  if (!patches || patches.length === 0) return { value: dimensions, changedPaths: [] };

  const byId = new Map<string, DimensionPatch>();
  for (const patch of patches) {
    // 입력에 없는 부문 id 는 버린다. 모델이 지어낸 부문일 수 있다.
    if (dimensions.some((d) => d.id === patch.id)) byId.set(patch.id, patch);
  }

  const changedPaths: string[] = [];
  const value = dimensions.map((dimension) => {
    const patch = byId.get(dimension.id);
    if (!patch) return dimension;

    /*
     * 연결할 경험을 하나도 못 찾은 부문에는 현재 근거·연결 경험 설명을 붙이지 않는다.
     * 근거로 쓸 경험이 없는데 그럴듯한 설명만 붙으면 없는 사실을 주장하게 된다.
     * 남는 차이(remainingGap)는 "아직 근거가 없다"는 말이라 근거 없이도 쓸 수 있다.
     */
    const hasEvidence =
      Array.isArray(dimension.usedExperienceIds) && dimension.usedExperienceIds.length > 0;

    const currentBasis = hasEvidence ? usable(patch.currentBasis) : null;
    const storyBasis = hasEvidence ? usable(patch.storyBasis) : null;
    const remainingGap = usable(patch.remainingGap);

    const next = {
      currentBasis:
        currentBasis && currentBasis !== dimension.currentBasis ? currentBasis : null,
      storyBasis: storyBasis && storyBasis !== dimension.storyBasis ? storyBasis : null,
      remainingGap:
        remainingGap && remainingGap !== dimension.remainingGap ? remainingGap : null,
    };
    if (!next.currentBasis && !next.storyBasis && !next.remainingGap) return dimension;

    for (const field of ["currentBasis", "storyBasis", "remainingGap"] as const) {
      if (next[field]) changedPaths.push(`dimension:${dimension.id}:${field}`);
    }

    // 점수·가중치·근거 목록은 규칙 엔진 값을 그대로 둔다. 모델 응답에서 읽지 않는다.
    return {
      ...dimension,
      currentBasis: next.currentBasis ?? dimension.currentBasis,
      storyBasis: next.storyBasis ?? dimension.storyBasis,
      remainingGap: next.remainingGap ?? dimension.remainingGap,
    };
  });

  return { value, changedPaths };
}

function applyStories(
  stories: StoryCard[],
  patches: StoryPatch[] | undefined,
): Applied<StoryCard[]> {
  if (!patches || patches.length === 0) return { value: stories, changedPaths: [] };

  const byId = new Map<string, StoryPatch>();
  for (const patch of patches) {
    if (stories.some((s) => s.id === patch.id)) byId.set(patch.id, patch);
  }

  const changedPaths: string[] = [];
  const value = stories.map((story) => {
    const patch = byId.get(story.id);
    if (!patch) return story;

    /*
     * 근거로 쓸 경험이 없는 스토리에는 문장을 붙이지 않는다.
     * 부문(applyDimensions)과 같은 이유인데, 여기서 만들어진 문장은 이력서로 바로 나가므로
     * 더 엄하게 본다.
     */
    if (!Array.isArray(story.usedExperienceIds) || story.usedExperienceIds.length === 0) {
      return story;
    }

    /*
     * scopeAndLimit 은 뺐다.
     *
     * 규칙 엔진이 `${current}% → ${afterStory}%. ${remainingGap}` 으로 **숫자를 직접 조립한**
     * 문자열이다. 모델이 이 필드를 바꾸면 점수 필드는 그대로인 채 화면의 게이지와
     * 다른 숫자가 같은 화면에 뜨고, 그대로 Word 문서로도 나간다.
     * 점수를 못 바꾸게 막아 놓고 점수가 적힌 문장을 열어 두면 막은 것이 아니다.
     */
    const fields = {
      connectionLogic: usable(patch.connectionLogic),
      resumeSentence: usable(patch.resumeSentence),
      interviewNote: usable(patch.interviewNote),
    } as const;

    const next: Partial<Record<keyof typeof fields, string>> = {};
    for (const field of Object.keys(fields) as (keyof typeof fields)[]) {
      const text = fields[field];
      if (text && text !== story[field]) next[field] = text;
    }
    const changedFields = Object.keys(next) as (keyof typeof fields)[];
    if (changedFields.length === 0) return story;

    for (const field of changedFields) changedPaths.push(`story:${story.id}:${field}`);

    // from/to 와 채택 여부(adopted)는 사용자와 규칙 엔진의 것이다. 문장만 바꾼다.
    return { ...story, ...next };
  });

  return { value, changedPaths };
}

/**
 * 우려 목록을 자리별로 교체한다. 개수는 원본 그대로다.
 *
 * 한 자리라도 검증에 걸리면 그 자리만 규칙 기반 문장이 남는다.
 * 모델이 보낸 것만 남기면 규칙 엔진이 찾아낸 우려가 사라지는데,
 * 우려가 사라진 분석서는 다듬어진 분석서가 아니라 다른 분석서다.
 */
function applyConcerns(
  original: CandidacyConcern[],
  patches: ConcernPatch[] | undefined,
  knownExperienceIds: Set<string>,
  pathPrefix: string,
): Applied<CandidacyConcern[]> {
  if (!patches) return { value: original, changedPaths: [] };

  const changedPaths: string[] = [];
  const value = original.map((current, index) => {
    const patch = patches[index];
    if (!patch) return current;

    const concern = usable(patch.concern);
    const response = usable(patch.response);
    // 한계가 빠진 우려는 쓰지 않는다. 답만 있고 한계가 없으면 설득이 아니라 변명이 된다.
    const honestLimit = usable(patch.honestLimit);
    if (!concern || !response || !honestLimit) return current;

    /*
     * 근거 목록은 **규칙 엔진의 것을 그대로 둔다.**
     *
     * 한때 모델이 준 evidenceIds 를 그대로 썼다. 개수만 지키면 된다고 보았는데,
     * 그 사이로 근거가 통째로 바뀌었다. 규칙 엔진이 "연결할 만한 경험이 아직 없습니다"
     * 라며 비워 둔 자리에 모델이 학사 학위를 근거로 붙였고, 화면은 그것을 칩으로 그렸다.
     * 근거가 바뀌면 문장이 아니라 **사실이 바뀐 것**이다. 이 앱이 하지 않기로 한 일이다.
     *
     * 그래서 모델이 든 근거는 화면에 나가지 않고, "이 답이 실제로 그 경험에 기대는가"를
     * 확인하는 관문으로만 쓴다.
     */
    const claimed = patch.evidenceIds ?? [];
    // 규칙 엔진이 근거를 못 찾은 우려에는 아무 말도 덧붙이지 않는다.
    // 근거가 없는데 그럴듯한 답만 붙으면 사용자가 확인할 길이 없다.
    if (current.evidenceIds.length === 0) return current;
    // 모델이 근거를 아예 대지 않았거나, 규칙 엔진이 이 우려에 붙이지 않은 경험을 끌어왔다면
    // 그 답은 다른 사실 위에 서 있는 것이므로 쓰지 않는다.
    if (claimed.length === 0) return current;
    if (claimed.some((id) => !current.evidenceIds.includes(id))) return current;

    const fields: string[] = [];
    if (concern !== current.concern) fields.push("concern");
    if (response !== current.response) fields.push("response");
    if (honestLimit !== current.honestLimit) fields.push("honestLimit");
    if (fields.length === 0) return current;

    for (const field of fields) changedPaths.push(`${pathPrefix}:concerns:${index}:${field}`);
    // evidenceIds 는 원본 그대로 나간다.
    return { ...current, concern, response, honestLimit };
  });

  return { value, changedPaths };
}

function applyCandidacy(
  original: CandidacyCase,
  patch: CandidacyPatch | undefined,
  knownExperienceIds: Set<string>,
  pathPrefix: string,
): Applied<CandidacyCase> {
  if (!patch) return { value: original, changedPaths: [] };

  const changedPaths: string[] = [];

  const headlineText = usable(patch.headline);
  const headline = headlineText && headlineText !== original.headline ? headlineText : null;
  if (headline) changedPaths.push(`${pathPrefix}:headline`);

  const reasons = applyTextList(
    original.reasonsToConsider,
    patch.reasonsToConsider,
    `${pathPrefix}:reasonsToConsider`,
  );
  changedPaths.push(...reasons.changedPaths);

  const conditions = applyTextList(
    original.conditions,
    patch.conditions,
    `${pathPrefix}:conditions`,
  );
  changedPaths.push(...conditions.changedPaths);

  const concerns = applyConcerns(original.concerns, patch.concerns, knownExperienceIds, pathPrefix);
  changedPaths.push(...concerns.changedPaths);

  if (changedPaths.length === 0) return { value: original, changedPaths: [] };

  // stage 와 caution 은 바꾸지 않는다. "이건 추정이다"라는 경고는 앱의 말이지 모델의 말이 아니다.
  return {
    value: {
      ...original,
      headline: headline ?? original.headline,
      reasonsToConsider: reasons.value,
      conditions: conditions.value,
      concerns: concerns.value,
    },
    changedPaths,
  };
}

/**
 * 검증을 통과한 값만 분석서에 얹는다. 입력 report 는 바꾸지 않는다.
 * changedPaths 가 비어 있으면 쓸 수 있는 것이 하나도 없었다는 뜻이다.
 */
export function applyEnrichment(
  report: StrategyReport,
  patch: EnrichPatch,
  profile: ApplicantProfile,
): Applied<StrategyReport> {
  const knownExperienceIds = new Set(profile.experiences.map((e) => e.id));

  const changedPaths: string[] = [];

  const oneLineText = usable(patch.idealCandidateOneLine);
  const oneLine =
    oneLineText && oneLineText !== report.idealCandidate.oneLine ? oneLineText : null;
  if (oneLine) changedPaths.push("idealCandidate:oneLine");

  const dimensions = applyDimensions(report.dimensions, patch.dimensions);
  changedPaths.push(...dimensions.changedPaths);

  const stories = applyStories(report.stories, patch.stories);
  changedPaths.push(...stories.changedPaths);

  const now = applyCandidacy(
    report.candidacyNow,
    patch.candidacyNow,
    knownExperienceIds,
    "candidacyNow",
  );
  changedPaths.push(...now.changedPaths);

  const future = applyCandidacy(
    report.candidacyFuture,
    patch.candidacyFuture,
    knownExperienceIds,
    "candidacyFuture",
  );
  changedPaths.push(...future.changedPaths);

  if (changedPaths.length === 0) return { value: report, changedPaths: [] };

  return {
    value: {
      ...report,
      idealCandidate: oneLine ? { ...report.idealCandidate, oneLine } : report.idealCandidate,
      dimensions: dimensions.value,
      stories: stories.value,
      candidacyNow: now.value,
      candidacyFuture: future.value,
      // 총점·판정·필수 조건은 규칙 엔진 그대로다. 화면이 출처를 밝힐 수 있도록 표시만 바꾼다.
      generatedBy: "llm",
    },
    changedPaths,
  };
}

/* ─────────────────────────────────────── 바깥에서 부르는 문 */

export interface EnrichInput {
  posting: JobPosting;
  profile: ApplicantProfile;
  report: StrategyReport;
  modelId: string;
  apiKey: string;
}

export interface EnrichOutcome {
  /** 보강됐거나, 실패하면 입력 그대로 */
  report: StrategyReport;
  usedLlm: boolean;
  failure?: LlmFailure;
  /**
   * 모델이 실제로 바꾼 자리의 경로.
   * 화면이 "정밀 분석이 다듬은 문장"만 짚어 원문과 비교할 수 있어야 하기 때문에,
   * 개수가 아니라 위치를 돌려준다. 실패했으면 빈 배열이다.
   */
  changedPaths: string[];
}

/**
 * 분석서의 문장을 모델로 보강한다.
 *
 * 이 함수는 실패하지 않는다. 무엇이 잘못되든 입력 report 를 그대로 돌려주고
 * 이유(failure)만 함께 준다. 호출부는 그 이유를 화면 문구로 옮기면 된다.
 * 동의·설정 확인(canUseLlm)은 호출부의 몫이다 — 이 함수는 이미 허락을 받은 뒤에만 불린다.
 */
export async function enrichReport(input: EnrichInput): Promise<EnrichOutcome> {
  try {
    const result = await callJson<EnrichPatch>(
      {
        modelId: input.modelId,
        apiKey: input.apiKey,
        system: ENRICH_SYSTEM_PROMPT,
        user: buildEnrichUserPrompt(input.posting, input.profile, input.report),
      },
      validateEnrichPatch,
    );

    if (!result.ok) {
      return { report: input.report, usedLlm: false, failure: result.reason, changedPaths: [] };
    }

    const applied = applyEnrichment(input.report, result.data, input.profile);
    if (applied.changedPaths.length === 0) {
      // 모양은 맞았지만 검증을 통과한 문장이 하나도 없었다. 규칙 기반 결과가 그대로 낫다.
      return { report: input.report, usedLlm: false, failure: "bad-response", changedPaths: [] };
    }

    return { report: applied.value, usedLlm: true, changedPaths: applied.changedPaths };
  } catch {
    /*
     * "이 함수는 실패하지 않는다"를 주석이 아니라 코드로 지킨다.
     * 모양이 깨진 분석서(예: dimensions 가 배열이 아님)는 프롬프트를 만드는 단계에서
     * 이미 예외를 던지는데, 그게 밖으로 나가면 분석 화면 전체가 멈춘다.
     * 규칙 기반 결과는 이미 손에 있으므로 그것을 그대로 돌려주는 편이 언제나 낫다.
     */
    return { report: input.report, usedLlm: false, failure: "bad-response", changedPaths: [] };
  }
}
