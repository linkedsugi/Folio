/**
 * 매칭률 계산.
 *
 * 기획서 03 의 검증값을 그대로 재현한다.
 *   부문 비중 20·20·15·15·10·10·5·5 (%)
 *   현재     20·50·25·25·75· 0·75· 0 → 32.75 → 화면 33
 *   스토리 후 20·75·25·50·75·25·75·25 → 45.25 → 화면 45
 *   목표     20·100·75·75·100·75·100·50 → 71.50 → 화면 72
 *
 * 규칙:
 *  - 전체 값은 부문 중요도를 반영한 가중 평균이며, 회사의 내부 배점이 아니다.
 *  - 표시는 반올림하되 계산은 원값으로 한다.
 *  - 단순 문장 수정으로는 afterStory 가 오르지 않는다(= 근거가 된 경험이 있어야 한다).
 *  - 실행 과제를 체크했다는 것만으로 target 을 현재 값에 반영하지 않는다.
 */

import type {
  ActionCard,
  ApplicationVerdict,
  MatchDimension,
  MatchScore,
  MustHaveStatus,
  OverallMatch,
  Requirement,
} from "./types";

export const MATCH_STAGES = ["current", "afterStory", "target"] as const;
export type MatchStage = (typeof MATCH_STAGES)[number];

export const STAGE_META: Record<
  MatchStage,
  { title: string; caption: string; meaning: string; changesWhen: string; tone: "now" | "story" | "goal" }
> = {
  current: {
    title: "현재 매칭",
    caption: "직접 경험 기준",
    meaning: "목표 업무를 직접 수행한 현재 근거로 설명되는 수준",
    changesWhen: "새로운 실제 수행 사실이나 책임·성과 근거가 확인될 때",
    tone: "now",
  },
  afterStory: {
    title: "스토리텔링 후",
    caption: "기존 관련 경험까지 연결",
    meaning: "이미 가진 관련 경력·학력·활동까지 연결해 설명할 수 있는 수준",
    changesWhen: "실제 경험의 관련성이 확인될 때. 미확인 후보는 포함하지 않음",
    tone: "story",
  },
  target: {
    title: "실행 목표",
    caption: "추가 경험·증거 확보 목표",
    meaning: "부족한 경험·결과물을 확보한 뒤 도달하고자 하는 수준",
    changesWhen: "과제 수행 후 결과와 책임 범위를 검토하여 재평가",
    tone: "goal",
  },
};

/** 0–100 범위로 자른다. */
export function clampScore(n: number): MatchScore {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

/** 화면 표기용 반올림. 계산에는 쓰지 않는다. */
export function displayScore(raw: number): number {
  return Math.round(raw);
}

/** 부문 비중의 합. 100 이 아니면 정규화해서 쓴다. */
export function totalWeight(dimensions: MatchDimension[]): number {
  return dimensions.reduce((sum, d) => sum + d.weight, 0);
}

/** 한 단계의 가중 평균 원값. */
export function weightedScore(dimensions: MatchDimension[], stage: MatchStage): number {
  const w = totalWeight(dimensions);
  if (w <= 0) return 0;
  const sum = dimensions.reduce((acc, d) => acc + d.weight * clampScore(d[stage]), 0);
  return sum / w;
}

/** 전체 매칭 3단계 — 원값과 화면값을 함께 만든다. */
export function computeOverall(dimensions: MatchDimension[]): OverallMatch {
  const raw = {
    current: weightedScore(dimensions, "current"),
    afterStory: weightedScore(dimensions, "afterStory"),
    target: weightedScore(dimensions, "target"),
  };
  return {
    raw,
    display: {
      current: displayScore(raw.current),
      afterStory: displayScore(raw.afterStory),
      target: displayScore(raw.target),
    },
  };
}

/**
 * 단계 순서가 뒤집히지 않게 보정한다.
 * 스토리텔링은 기존 경험을 "연결"하는 것이므로 현재보다 낮아질 수 없고,
 * 목표는 스토리 후보다 낮아질 수 없다.
 */
export function normalizeDimension(d: MatchDimension): MatchDimension {
  const current = clampScore(d.current);
  const afterStory = Math.max(current, clampScore(d.afterStory));
  const target = Math.max(afterStory, clampScore(d.target));
  return { ...d, current, afterStory, target };
}

export function normalizeDimensions(dimensions: MatchDimension[]): MatchDimension[] {
  return dimensions.map(normalizeDimension);
}

/**
 * 필수 조건 충족 여부는 총점과 별개의 정보다. (기획서 04)
 * 전체 목표가 72%여도 "필수 경력 5년을 충족했다"는 뜻이 아니다.
 */
export function deriveMustHaveStatus(
  requirements: Requirement[],
  dimensions: MatchDimension[],
): MustHaveStatus[] {
  return requirements
    .filter((r) => r.kind === "must")
    .map((r) => {
      const dim = dimensions.find((d) => d.requirementId === r.id);
      if (!dim) {
        return {
          requirementId: r.id,
          label: r.label,
          state: "needs-confirmation" as const,
          note: "이 조건에 연결된 근거를 찾지 못했습니다. 관련 경험을 추가해 주세요.",
        };
      }
      if (dim.confidence === "needs-confirmation") {
        return {
          requirementId: r.id,
          label: r.label,
          state: "needs-confirmation" as const,
          note: dim.remainingGap || "확인이 더 필요한 항목입니다.",
        };
      }
      // 만점만 "충족" 으로 보면 거의 모든 조건이 미충족이 되어, 조건을 갖춘 지원자에게도
      // 지원하지 말라는 신호를 준다. 직접 수행한 근거가 충분하면 충족으로 본다.
      if (dim.current >= 75) {
        return { requirementId: r.id, label: r.label, state: "met" as const, note: dim.currentBasis };
      }
      if (dim.afterStory >= 50 || dim.current >= 25) {
        return {
          requirementId: r.id,
          label: r.label,
          state: "partially-met" as const,
          note: dim.remainingGap || dim.storyBasis,
        };
      }
      return {
        requirementId: r.id,
        label: r.label,
        state: "not-met" as const,
        note: dim.remainingGap || "이 조건을 직접 설명할 근거가 아직 부족합니다.",
      };
    });
}

/**
 * 지원 판단 — 총점 하나로 결정하지 않는다. (기획서 07)
 * 필수 조건의 상태를 먼저 보고, 그 다음에 전체 흐름을 본다.
 */
export function deriveVerdict(
  overall: OverallMatch,
  mustHave: MustHaveStatus[],
  /**
   * **충족하지 못한** 필수 조건 중에 동등 경험 인정 여부가 불확실한 것이 있는가.
   *
   * 공고 전체에 하나라도 불확실한 조건이 있는지로 판단하면 안 된다.
   * 거의 모든 공고에 그런 조건이 하나쯤은 있어서, 모든 지원이 똑같이
   * "조건 확인과 지원 병행" 으로 나와 판단이 아무것도 가르지 못하게 된다.
   * 이미 충족한 조건의 동등 인정 여부는 물어볼 이유가 없다.
   */
  equivalenceUnknownOnGap: boolean,
): ApplicationVerdict {
  const notMet = mustHave.filter((m) => m.state === "not-met").length;
  const partial = mustHave.filter((m) => m.state === "partially-met").length;
  const unconfirmed = mustHave.filter((m) => m.state === "needs-confirmation").length;
  const met = mustHave.filter((m) => m.state === "met").length;
  const gaps = notMet + partial + unconfirmed;

  // 필수를 모두 충족했다면 더 물을 것이 없다. 남은 일은 사실 확인과 문서 완성이다.
  if (gaps === 0 && met === mustHave.length) return "proceed-with-current";

  /*
   * 지원 범위 조정은 가장 무거운 안내다. 함부로 주면 "지원하지 마세요" 로 읽힌다.
   * 기획서 13 은 낮은 점수로 불안을 자극하지 말라고 못박았다.
   * 그래서 필수 조건이 여럿 비어 있으면서 전체 설명력도 낮을 때만 준다.
   * 신입 공고에 지원하는 신입처럼, 조건이 비어도 그것이 정상인 경우를 걸러내기 위해서다.
   */
  if (notMet >= 2 && overall.raw.afterStory < 45) return "adjust-scope";

  // 판단에 필요한 정보 자체가 없거나, 못 채운 조건을 동등 경험으로 인정받을 수 있을지
  // 모르는 경우에만 문의와 준비를 병행한다.
  if ((unconfirmed > 0 || equivalenceUnknownOnGap) && overall.raw.afterStory >= 40) {
    return "apply-while-confirming";
  }

  return "strengthen-then-reassess";
}

/**
 * 재평가.
 *
 * 실행 과제를 "완료 체크"한 것만으로 점수를 올리지 않는다. (기획서 10)
 * 결과물과 본인 역할이 실제로 제출된(evidence-submitted) 과제만,
 * 그리고 그 근거가 확인된 경우에만 해당 부문의 현재 값을 다시 계산한다.
 */
export interface ReassessResult {
  dimensions: MatchDimension[];
  overall: OverallMatch;
  changed: { dimensionId: string; from: MatchScore; to: MatchScore; reason: string }[];
  ignored: { actionId: string; reason: string }[];
}

export function reassess(dimensions: MatchDimension[], actions: ActionCard[]): ReassessResult {
  const changed: ReassessResult["changed"] = [];
  const ignored: ReassessResult["ignored"] = [];

  const next = dimensions.map((d) => {
    const relevant = actions.filter((a) => a.dimensionId === d.id);
    const submitted = relevant.filter((a) => a.status === "evidence-submitted" && a.submittedEvidence?.trim());

    relevant
      .filter((a) => !submitted.includes(a))
      .forEach((a) => {
        if (a.status === "in-progress" || a.status === "evidence-submitted") {
          ignored.push({
            actionId: a.id,
            reason:
              a.status === "evidence-submitted"
                ? "완료 증거 설명이 비어 있어 재평가에 반영하지 않았습니다."
                : "진행 중 표시만으로는 점수가 오르지 않습니다. 결과물과 본인 역할을 추가해 주세요.",
          });
        }
      });

    if (submitted.length === 0) return d;

    // 제출된 증거가 목표하던 수준까지 끌어올린다. 목표를 넘지는 않는다.
    const highest = submitted.reduce((max, a) => Math.max(max, a.to), d.current);
    const to = Math.min(clampScore(highest), d.target);
    if (to <= d.current) return d;

    changed.push({
      dimensionId: d.id,
      from: d.current,
      to,
      reason: submitted.map((a) => a.gap).join(" / "),
    });
    // 새 사실이 확인되었으므로 현재 값이 오르고, 스토리 후 값도 최소한 그만큼이 된다.
    return normalizeDimension({ ...d, current: to, afterStory: Math.max(d.afterStory, to) });
  });

  return { dimensions: next, overall: computeOverall(next), ignored, changed };
}

/** 읽는 법 — 화면 하단에 항상 붙인다. */
export const READING_NOTE =
  "수치는 합격확률이 아닌 직무 매칭률입니다. 스토리 후는 기존 경험의 관련성을 반영한 값이며 단순 문장 수정으로 상승하지 않습니다. 목표는 증거 확보 후 재평가할 조건부 목표입니다.";

/** 전체 가중값 설명 문구 — 기획서 03 하단과 같은 형식. */
export function weightSummary(dimensions: MatchDimension[], overall: OverallMatch): string {
  const r = overall.raw;
  const d = overall.display;
  const fmt = (n: number) => n.toFixed(2);
  return `전체 가중값: ${fmt(r.current)} → ${fmt(r.afterStory)} → ${fmt(r.target)}, 화면 반올림 ${d.current} → ${d.afterStory} → ${d.target}. 부문 비중(위 순서): ${dimensions.map((x) => x.weight).join("·")}%.`;
}
