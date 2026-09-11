/**
 * 지원 설득 논리 만들기 — "합격 가능성 스토리".
 *
 * 매칭률은 숫자로, 채용 가능성은 이야기로 분리한다.
 * 이 파일은 숫자를 말로 바꾸지 않는다. 점수의 근거가 된 사실을 다시 읽어
 * "검토할 이유 / 우려 / 우려에 대한 답 / 전제 조건"을 만든다.
 *
 * 지켜야 할 선:
 *  - 확률로 말하지 않는다. "합격 가능성 70%" 같은 문장을 만들지 않는다.
 *  - 실제 팀장의 판단을 확인한 것처럼 쓰지 않는다. 전부 "…할 수 있습니다" 수준의 추정이다.
 *  - 우려에 답할 때 없는 사실을 만들지 않는다. 답해도 남는 한계(honestLimit)를 반드시 함께 쓴다.
 */

import {
  MUST_HAVE_STATE_LABEL,
  VERDICT_LABEL,
  type ApplicantProfile,
  type CandidacyCase,
  type CandidacyConcern,
  type JobPosting,
  type MatchDimension,
  type MustHaveStatus,
  type StrategyReport,
} from "@/lib/types";

/** 검토할 이유로 내세울 만한 부문인지. 스토리텔링까지 반영한 값을 기준으로 본다. */
function isStrength(d: MatchDimension): boolean {
  return d.afterStory >= 75;
}

/** 모집팀이 우려할 만한 부문인지. 비중이 큰 부문의 낮은 값일수록 먼저 다룬다. */
function isConcern(d: MatchDimension): boolean {
  return d.afterStory < 50 || d.confidence === "needs-confirmation";
}

function byImportance(a: MatchDimension, b: MatchDimension): number {
  if (a.kind !== b.kind) {
    // 필수 → 우대 → 일반 순으로 본다. 우려는 필수에서 먼저 나온다.
    const rank = { must: 0, preferred: 2, general: 1 } as const;
    return rank[a.kind] - rank[b.kind];
  }
  return b.weight - a.weight;
}

/** 한 부문을 "검토할 이유" 한 줄로. 근거가 된 경험을 함께 말한다. */
function reasonLine(d: MatchDimension): string {
  const basis = d.storyBasis?.trim() || d.currentBasis?.trim();
  return basis ? `${d.label} — ${basis}` : d.label;
}

/**
 * 한 부문을 "우려 + 답" 으로.
 *
 * 답은 두 종류뿐이다:
 *  - 관련 경험이 있으면: 그 경험으로 설명하되, 환경이 다르다는 점을 먼저 인정한다.
 *  - 없으면: 없다고 말하고, 어떤 조건에서 확인해 줄 수 있는지로 넘긴다.
 * 둘 다 아닌 "잘할 수 있습니다" 류는 만들지 않는다.
 */
function toConcern(d: MatchDimension, hasStory: boolean): CandidacyConcern {
  const gap = d.remainingGap?.trim() || `${d.label} 를 직접 수행한 근거가 아직 부족합니다.`;

  if (d.confidence === "needs-confirmation") {
    return {
      concern: `${d.label} — 자료만으로는 판단하기 어려운 항목입니다.`,
      response:
        "이 항목은 확인이 필요한 상태로 두었습니다. 관련 경험이 있다면 역할과 결과를 덧붙여 확인받는 편이 낫습니다.",
      evidenceIds: d.usedExperienceIds,
      honestLimit: gap,
    };
  }

  if (hasStory && d.afterStory > d.current) {
    return {
      concern: `${d.label} — 직접 수행한 범위가 요구보다 좁습니다.`,
      response:
        `${d.storyBasis?.trim() || "관련 경험"} 로 문제 해결 과정은 설명할 수 있습니다. ` +
        "다만 환경이 다르다는 점을 먼저 밝히고, 공통된 절차와 판단 과정을 설명하는 방식이 맞습니다.",
      evidenceIds: d.usedExperienceIds,
      honestLimit: gap,
    };
  }

  return {
    concern: `${d.label} — 연결할 만한 경험이 아직 없습니다.`,
    response:
      "이 부분은 없다고 말하는 편이 낫습니다. 대신 무엇을 언제까지 확보할 계획인지, " +
      "그리고 그 결과를 어떤 자료로 보여줄 것인지로 답할 수 있습니다.",
    evidenceIds: [],
    honestLimit: gap,
  };
}

/** 필수 조건 상태에서 "지금 지원을 검토할 만한 조건"을 뽑는다. */
function conditionsFrom(mustHave: MustHaveStatus[], posting: JobPosting): string[] {
  const out: string[] = [];

  for (const m of mustHave) {
    const req = posting.requirements.find((r) => r.id === m.requirementId);
    if (m.state === "met") continue;

    if (m.state === "needs-confirmation") {
      out.push(`${m.label} — ${MUST_HAVE_STATE_LABEL[m.state]}. 지원 전에 모집팀에 기준을 문의해 두면 판단이 빨라집니다.`);
      continue;
    }
    if (req?.equivalence === "allowed") {
      out.push(
        `${m.label} 은 동등 경험을 인정한다고 공고에 적혀 있습니다. 어떤 경험을 동등으로 볼지 정리해 두면 지금 지원해도 설명할 수 있습니다.`,
      );
      continue;
    }
    if (req?.equivalence === "unknown") {
      out.push(
        `${m.label} 은 동등 경험 인정 여부가 공고에 없습니다. 인정 범위를 문의하면서 지원을 병행할 수 있습니다.`,
      );
      continue;
    }
    out.push(`${m.label} 은 대체가 어려운 조건입니다. 이 조건을 요구하지 않는 유사 포지션도 함께 살펴보세요.`);
  }

  if (out.length === 0) {
    out.push("필수 조건에서 확인이 필요한 항목이 없습니다. 사실 확인을 마친 뒤 바로 지원할 수 있습니다.");
  }
  return out;
}

const NOW_CAUTION =
  "이 설명은 공고 문구와 입력한 이력만 보고 만든 추정입니다. 실제 모집팀의 판단을 확인한 것이 아니며, 합격 가능성을 확률로 나타내지 않습니다. 매칭률은 요구사항과의 대응 정도이고, 이 이야기는 강점·우려·전제 조건에 대한 판단입니다.";

const FUTURE_CAUTION =
  "실행 과제를 모두 마치고 결과와 본인 역할이 확인되었을 때를 가정한 설명입니다. 아직 사실이 아니므로 이 내용을 지금 이력서나 면접에서 완료된 경험처럼 말하면 안 됩니다.";

/**
 * 지금 지원한다면 — 이력서 2 기준의 설득 논리.
 * 이력서 3을 완성할 때까지 지원을 미루게 하지 않기 위해 독립 결과로 만든다.
 */
export function buildCandidacyNow(
  dimensions: MatchDimension[],
  mustHave: MustHaveStatus[],
  posting: JobPosting,
  profile: ApplicantProfile,
  verdict: StrategyReport["verdict"],
  hasStories: boolean,
): CandidacyCase {
  const sorted = [...dimensions].sort(byImportance);
  const strengths = sorted.filter(isStrength);
  const concerns = sorted.filter(isConcern).slice(0, 4);

  const topStrength = strengths[0];
  const headline = topStrength
    ? `${topStrength.label} 를 실제로 해 본 사람으로 검토될 수 있습니다. 다만 ${concerns[0]?.label ?? "일부 조건"} 은 설명이 필요합니다.`
    : `현재 근거만으로는 요구 범위를 모두 설명하기 어렵습니다. 관련 경험을 어떻게 연결할지가 이번 지원의 관건입니다.`;

  const reasons = strengths.slice(0, 4).map(reasonLine);
  if (reasons.length === 0) {
    // 강점이 없다고 빈 목록을 주지 않는다. 가장 높은 부문이라도 사실대로 말한다.
    const best = [...sorted].sort((a, b) => b.afterStory - a.afterStory)[0];
    if (best) reasons.push(reasonLine(best));
  }
  const name = profile.name ? `${profile.name} 님` : "지원자";
  reasons.push(
    `지원 판단: ${VERDICT_LABEL[verdict]}. ${name}의 이력에서 이 공고와 맞물리는 근거를 ${dimensions.filter((d) => d.usedExperienceIds.length > 0).length}개 부문에서 찾았습니다.`,
  );

  return {
    stage: "now",
    headline,
    reasonsToConsider: reasons,
    concerns: concerns.map((d) => toConcern(d, hasStories)),
    conditions: conditionsFrom(mustHave, posting),
    caution: NOW_CAUTION,
  };
}

/**
 * 실행 과제를 마쳤다면 — 이력서 3 기준의 설득 논리.
 * 목표 값이 아니라 "그때 무엇을 말할 수 있게 되는가"를 쓴다.
 */
export function buildCandidacyFuture(
  dimensions: MatchDimension[],
  mustHave: MustHaveStatus[],
  posting: JobPosting,
  actions: StrategyReport["actions"],
): CandidacyCase {
  const sorted = [...dimensions].sort(byImportance);
  const improved = sorted.filter((d) => d.target > d.afterStory);
  // 과제를 다 해도 남는 것 — 주로 실무 연수처럼 시간이 필요한 조건이다.
  const stillShort = sorted.filter((d) => d.target < 75 || d.targetCaveat);

  const headline = improved.length
    ? `${improved
        .slice(0, 2)
        .map((d) => d.label)
        .join(" 과 ")} 를 직접 수행한 근거가 생기면, 설명의 무게가 달라집니다.`
    : "현재 확보한 근거 위에서 이미 설명할 수 있는 범위입니다. 새로 만들 것보다 정리할 것이 많습니다.";

  return {
    stage: "future",
    headline,
    reasonsToConsider: actions.slice(0, 5).map((a) => `“${a.targetSentence}” — ${a.experienceNeeded}`),
    concerns: stillShort.slice(0, 3).map((d) => ({
      concern: `${d.label} — 과제를 마쳐도 요구 수준에 닿지 않을 수 있습니다.`,
      response:
        d.targetCaveat ??
        "이 부분은 한 번의 과제로 메워지지 않습니다. 어디까지 직접 했는지를 정확히 말하는 편이 낫습니다.",
      evidenceIds: d.usedExperienceIds,
      honestLimit: d.remainingGap,
    })),
    conditions: conditionsFrom(mustHave, posting),
    caution: FUTURE_CAUTION,
  };
}

/**
 * 이미 만들어진 분석서에 두 설득 논리를 붙인다.
 *
 * 매칭 엔진을 건드리지 않고 얹는 이유: 점수 계산과 설득 논리는 서로 다른 일이다.
 * 점수가 바뀌면 논리도 다시 만들면 되고, 논리를 고쳐도 점수는 움직이지 않아야 한다.
 */
export function withCandidacy(
  report: Omit<StrategyReport, "candidacyNow" | "candidacyFuture"> &
    Partial<Pick<StrategyReport, "candidacyNow" | "candidacyFuture">>,
  posting: JobPosting,
  profile: ApplicantProfile,
): StrategyReport {
  return {
    ...report,
    candidacyNow: buildCandidacyNow(
      report.dimensions,
      report.mustHaveStatus,
      posting,
      profile,
      report.verdict,
      report.stories.length > 0,
    ),
    candidacyFuture: buildCandidacyFuture(
      report.dimensions,
      report.mustHaveStatus,
      posting,
      report.actions,
    ),
  };
}
