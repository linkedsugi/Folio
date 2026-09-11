import { describe, expect, it } from "vitest";
import {
  computeOverall,
  deriveMustHaveStatus,
  deriveVerdict,
  normalizeDimension,
  reassess,
  weightedScore,
} from "../scoring";
import type { ActionCard, MatchDimension, Requirement } from "../types";

/** 기획서 03 의 표를 그대로 옮긴 고정값. 회귀 테스트의 기준이다. */
const PLAN_ROWS: Array<[string, number, number, number, number]> = [
  // [label, weight, current, afterStory, target]
  ["게임 개발 5년", 20, 20, 20, 20],
  ["Unity·C# 핵심 기능 구현", 20, 50, 75, 100],
  ["출시 전 과정 책임", 15, 25, 25, 75],
  ["성능 분석·최적화", 15, 25, 50, 75],
  ["다직군 협업·코드 리뷰", 10, 75, 75, 100],
  ["장기 라이브 운영", 10, 0, 25, 75],
  ["포트폴리오", 5, 75, 75, 100],
  ["주니어 멘토링", 5, 0, 25, 50],
];

function dim(
  [label, weight, current, afterStory, target]: (typeof PLAN_ROWS)[number],
  i: number,
): MatchDimension {
  return {
    id: `d${i}`,
    label,
    kind: "general",
    weight,
    current,
    afterStory,
    target,
    teamExpectation: "",
    currentBasis: "",
    storyBasis: "",
    nextStep: "",
    evidenceToProduce: "",
    remainingGap: "",
    rationale: [],
    usedExperienceIds: [],
    confidence: "confirmed",
  };
}

const DIMENSIONS = PLAN_ROWS.map(dim);

describe("기획서 03 의 검증 수치를 재현한다", () => {
  it("부문 비중의 합은 100", () => {
    expect(DIMENSIONS.reduce((s, d) => s + d.weight, 0)).toBe(100);
  });

  it("전체 가중값은 32.75 → 45.25 → 71.50", () => {
    expect(weightedScore(DIMENSIONS, "current")).toBeCloseTo(32.75, 10);
    expect(weightedScore(DIMENSIONS, "afterStory")).toBeCloseTo(45.25, 10);
    expect(weightedScore(DIMENSIONS, "target")).toBeCloseTo(71.5, 10);
  });

  it("화면 반올림은 33 → 45 → 72", () => {
    const overall = computeOverall(DIMENSIONS);
    expect(overall.display).toEqual({ current: 33, afterStory: 45, target: 72 });
  });
});

describe("단계 순서 보정", () => {
  it("스토리 후는 현재보다 낮아질 수 없다", () => {
    const d = normalizeDimension({ ...DIMENSIONS[0], current: 60, afterStory: 40, target: 30 });
    expect(d.afterStory).toBe(60);
    expect(d.target).toBe(60);
  });

  it("0-100 범위를 벗어나지 않는다", () => {
    const d = normalizeDimension({ ...DIMENSIONS[0], current: -20, afterStory: 130, target: 200 });
    expect(d.current).toBe(0);
    expect(d.afterStory).toBe(100);
    expect(d.target).toBe(100);
  });
});

describe("필수 조건은 총점과 별개의 정보다", () => {
  const requirements: Requirement[] = [
    {
      id: "r-years",
      kind: "must",
      label: "게임 개발 5년",
      text: "상용 게임 개발 5년 이상",
      equivalence: "unknown",
      sourceQuote: "상용 게임 개발 5년 이상",
    },
  ];

  it("목표가 72%여도 필수 조건이 충족된 것은 아니다", () => {
    const dims = DIMENSIONS.map((d, i) => (i === 0 ? { ...d, requirementId: "r-years" } : d));
    const overall = computeOverall(dims);
    expect(overall.display.target).toBe(72);

    const status = deriveMustHaveStatus(requirements, dims);
    expect(status[0].state).not.toBe("met");
  });

  it("연결된 부문이 없으면 확인 필요로 남긴다", () => {
    const status = deriveMustHaveStatus(requirements, DIMENSIONS);
    expect(status[0].state).toBe("needs-confirmation");
  });
});

describe("지원 판단은 총점 하나로 결정하지 않는다", () => {
  it("동등 경험 인정 여부가 불확실하면 조건 확인과 지원을 병행한다", () => {
    const overall = computeOverall(DIMENSIONS);
    const verdict = deriveVerdict(overall, [
      { requirementId: "r", label: "게임 개발 5년", state: "needs-confirmation", note: "" },
    ], true);
    expect(verdict).toBe("apply-while-confirming");
  });

  it("필수 조건이 크게 미달하면 지원 범위를 조정한다", () => {
    const low = DIMENSIONS.map((d) => ({ ...d, current: 0, afterStory: 10, target: 40 }));
    const verdict = deriveVerdict(computeOverall(low), [
      { requirementId: "a", label: "A", state: "not-met", note: "" },
      { requirementId: "b", label: "B", state: "not-met", note: "" },
    ], false);
    expect(verdict).toBe("adjust-scope");
  });
});

describe("재평가: 체크만으로 점수를 주지 않는다", () => {
  const base: ActionCard = {
    id: "a1",
    dimensionId: "d3",
    priority: 2,
    gap: "게임 내 독립 최적화",
    from: 50,
    to: 75,
    actions: [],
    evidence: [],
    conditions: [],
    reassessCriteria: "",
    status: "todo",
    savedToPlan: true,
  };

  it("진행 중 표시만으로는 오르지 않는다", () => {
    const r = reassess(DIMENSIONS, [{ ...base, status: "in-progress" }]);
    expect(r.changed).toHaveLength(0);
    expect(r.ignored[0].reason).toContain("진행 중");
  });

  it("완료 증거 설명이 비어 있으면 반영하지 않는다", () => {
    const r = reassess(DIMENSIONS, [{ ...base, status: "evidence-submitted", submittedEvidence: "  " }]);
    expect(r.changed).toHaveLength(0);
    expect(r.ignored[0].reason).toContain("완료 증거");
  });

  it("결과물과 본인 역할이 제출되면 해당 부문만 재평가한다", () => {
    const r = reassess(DIMENSIONS, [
      { ...base, status: "evidence-submitted", submittedEvidence: "전후 측정치와 본인 커밋 기록" },
    ]);
    expect(r.changed).toEqual([
      { dimensionId: "d3", from: 25, to: 75, reason: "게임 내 독립 최적화" },
    ]);
    // 해당 부문(비중 15%)만 25 → 75 로 오른다: 32.75 + 0.15*50 = 40.25
    expect(r.overall.raw.current).toBeCloseTo(40.25, 10);
  });

  it("목표를 넘겨서 오르지 않는다", () => {
    const r = reassess(DIMENSIONS, [
      { ...base, to: 100, status: "evidence-submitted", submittedEvidence: "증거" },
    ]);
    expect(r.changed[0].to).toBe(75); // d3 의 target
  });
});
