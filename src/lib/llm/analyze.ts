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
 * ── 무엇을 버리는가 ───────────────────────────────────────────
 * 입력에 없는 id, 빈 문장, 500자를 넘는 문장, 한계를 빼먹은 우려,
 * 확률로 말하는 문장. 하나라도 걸리면 그 항목만 버리고 규칙 기반 값을 유지한다.
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
  scopeAndLimit?: string;
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

function usableList(raw: string[] | undefined): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const item of raw) {
    const text = usable(item);
    if (text) out.push(text);
  }
  return out;
}

/* ─────────────────────────────────────── 응답 검증 (모양) */

function parseCandidacy(value: unknown): CandidacyPatch | undefined {
  const raw = asRecord(value);
  if (!raw) return undefined;

  const concernsRaw = Array.isArray(raw.concerns) ? raw.concerns : undefined;
  const concerns = concernsRaw
    ?.map((entry): ConcernPatch | null => {
      const c = asRecord(entry);
      if (!c) return null;
      return {
        concern: asString(c.concern),
        response: asString(c.response),
        honestLimit: asString(c.honestLimit),
        evidenceIds: asStringArray(c.evidenceIds),
      };
    })
    .filter((c): c is ConcernPatch => c !== null);

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
            scopeAndLimit: asString(s.scopeAndLimit),
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

interface Applied<T> {
  value: T;
  changed: number;
}

function applyDimensions(
  dimensions: MatchDimension[],
  patches: DimensionPatch[] | undefined,
): Applied<MatchDimension[]> {
  if (!patches || patches.length === 0) return { value: dimensions, changed: 0 };

  const byId = new Map<string, DimensionPatch>();
  for (const patch of patches) {
    // 입력에 없는 부문 id 는 버린다. 모델이 지어낸 부문일 수 있다.
    if (dimensions.some((d) => d.id === patch.id)) byId.set(patch.id, patch);
  }

  let changed = 0;
  const value = dimensions.map((dimension) => {
    const patch = byId.get(dimension.id);
    if (!patch) return dimension;

    const currentBasis = usable(patch.currentBasis);
    const storyBasis = usable(patch.storyBasis);
    const remainingGap = usable(patch.remainingGap);
    if (!currentBasis && !storyBasis && !remainingGap) return dimension;

    if (currentBasis) changed += 1;
    if (storyBasis) changed += 1;
    if (remainingGap) changed += 1;

    // 점수·가중치·근거 목록은 규칙 엔진 값을 그대로 둔다. 모델 응답에서 읽지 않는다.
    return {
      ...dimension,
      currentBasis: currentBasis ?? dimension.currentBasis,
      storyBasis: storyBasis ?? dimension.storyBasis,
      remainingGap: remainingGap ?? dimension.remainingGap,
    };
  });

  return { value, changed };
}

function applyStories(
  stories: StoryCard[],
  patches: StoryPatch[] | undefined,
): Applied<StoryCard[]> {
  if (!patches || patches.length === 0) return { value: stories, changed: 0 };

  const byId = new Map<string, StoryPatch>();
  for (const patch of patches) {
    if (stories.some((s) => s.id === patch.id)) byId.set(patch.id, patch);
  }

  let changed = 0;
  const value = stories.map((story) => {
    const patch = byId.get(story.id);
    if (!patch) return story;

    const connectionLogic = usable(patch.connectionLogic);
    const resumeSentence = usable(patch.resumeSentence);
    const interviewNote = usable(patch.interviewNote);
    const scopeAndLimit = usable(patch.scopeAndLimit);
    if (!connectionLogic && !resumeSentence && !interviewNote && !scopeAndLimit) return story;

    if (connectionLogic) changed += 1;
    if (resumeSentence) changed += 1;
    if (interviewNote) changed += 1;
    if (scopeAndLimit) changed += 1;

    // from/to 와 채택 여부(adopted)는 사용자와 규칙 엔진의 것이다. 문장만 바꾼다.
    return {
      ...story,
      connectionLogic: connectionLogic ?? story.connectionLogic,
      resumeSentence: resumeSentence ?? story.resumeSentence,
      interviewNote: interviewNote ?? story.interviewNote,
      scopeAndLimit: scopeAndLimit ?? story.scopeAndLimit,
    };
  });

  return { value, changed };
}

function applyConcerns(
  original: CandidacyConcern[],
  patches: ConcernPatch[] | undefined,
  knownExperienceIds: Set<string>,
): Applied<CandidacyConcern[]> {
  if (!patches) return { value: original, changed: 0 };

  const kept: CandidacyConcern[] = [];
  for (const patch of patches) {
    const concern = usable(patch.concern);
    const response = usable(patch.response);
    // 한계가 빠진 우려는 버린다. 답만 있고 한계가 없으면 설득이 아니라 변명이 된다.
    const honestLimit = usable(patch.honestLimit);
    if (!concern || !response || !honestLimit) continue;

    const evidenceIds = patch.evidenceIds ?? [];
    // 없는 경험을 근거로 든 우려는 통째로 버린다. 근거가 거짓이면 답도 거짓이다.
    if (evidenceIds.some((id) => !knownExperienceIds.has(id))) continue;

    kept.push({ concern, response, honestLimit, evidenceIds });
  }

  if (kept.length === 0) return { value: original, changed: 0 };
  return { value: kept, changed: kept.length };
}

function applyCandidacy(
  original: CandidacyCase,
  patch: CandidacyPatch | undefined,
  knownExperienceIds: Set<string>,
): Applied<CandidacyCase> {
  if (!patch) return { value: original, changed: 0 };

  let changed = 0;

  const headline = usable(patch.headline);
  if (headline) changed += 1;

  const reasons = usableList(patch.reasonsToConsider);
  if (reasons.length > 0) changed += 1;

  const conditions = usableList(patch.conditions);
  if (conditions.length > 0) changed += 1;

  const concerns = applyConcerns(original.concerns, patch.concerns, knownExperienceIds);
  changed += concerns.changed;

  if (changed === 0) return { value: original, changed: 0 };

  // stage 와 caution 은 바꾸지 않는다. "이건 추정이다"라는 경고는 앱의 말이지 모델의 말이 아니다.
  return {
    value: {
      ...original,
      headline: headline ?? original.headline,
      reasonsToConsider: reasons.length > 0 ? reasons : original.reasonsToConsider,
      conditions: conditions.length > 0 ? conditions : original.conditions,
      concerns: concerns.value,
    },
    changed,
  };
}

/**
 * 검증을 통과한 값만 분석서에 얹는다. 입력 report 는 바꾸지 않는다.
 * changed 가 0 이면 쓸 수 있는 것이 하나도 없었다는 뜻이다.
 */
export function applyEnrichment(
  report: StrategyReport,
  patch: EnrichPatch,
  profile: ApplicantProfile,
): Applied<StrategyReport> {
  const knownExperienceIds = new Set(profile.experiences.map((e) => e.id));

  let changed = 0;

  const oneLine = usable(patch.idealCandidateOneLine);
  if (oneLine) changed += 1;

  const dimensions = applyDimensions(report.dimensions, patch.dimensions);
  changed += dimensions.changed;

  const stories = applyStories(report.stories, patch.stories);
  changed += stories.changed;

  const now = applyCandidacy(report.candidacyNow, patch.candidacyNow, knownExperienceIds);
  changed += now.changed;

  const future = applyCandidacy(report.candidacyFuture, patch.candidacyFuture, knownExperienceIds);
  changed += future.changed;

  if (changed === 0) return { value: report, changed: 0 };

  return {
    value: {
      ...report,
      idealCandidate: oneLine
        ? { ...report.idealCandidate, oneLine }
        : report.idealCandidate,
      dimensions: dimensions.value,
      stories: stories.value,
      candidacyNow: now.value,
      candidacyFuture: future.value,
      // 총점·판정·필수 조건은 규칙 엔진 그대로다. 화면이 출처를 밝힐 수 있도록 표시만 바꾼다.
      generatedBy: "llm",
    },
    changed,
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
}

/**
 * 분석서의 문장을 모델로 보강한다.
 *
 * 이 함수는 실패하지 않는다. 무엇이 잘못되든 입력 report 를 그대로 돌려주고
 * 이유(failure)만 함께 준다. 호출부는 그 이유를 화면 문구로 옮기면 된다.
 * 동의·설정 확인(canUseLlm)은 호출부의 몫이다 — 이 함수는 이미 허락을 받은 뒤에만 불린다.
 */
export async function enrichReport(input: EnrichInput): Promise<EnrichOutcome> {
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
    return { report: input.report, usedLlm: false, failure: result.reason };
  }

  const applied = applyEnrichment(input.report, result.data, input.profile);
  if (applied.changed === 0) {
    // 모양은 맞았지만 검증을 통과한 문장이 하나도 없었다. 규칙 기반 결과가 그대로 낫다.
    return { report: input.report, usedLlm: false, failure: "bad-response" };
  }

  return { report: applied.value, usedLlm: true };
}
