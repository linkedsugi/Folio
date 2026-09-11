/**
 * 매칭 엔진 검증.
 * 픽스처는 이 파일 안에서 직접 만든 가상 JD / 가상 이력이다(실제 회사·인물이 아니다).
 */
import { describe, expect, it } from "vitest";

import type { ApplicantProfile, ExperienceItem, JobPosting, Requirement } from "../../types";
import { computeOverall, READING_NOTE } from "../../scoring";
import {
  ALLOWED_LEVELS,
  assignWeights,
  buildActions,
  buildDimensions,
  buildEnrichmentQuestions,
  buildEvidenceIndex,
  buildReport,
  buildStories,
  defaultProfessionalMonths,
  domainAnchors,
  parseTenure,
} from "../match";

/* ──────────────────────────────────── 가상 픽스처 */

function req(
  id: string,
  kind: Requirement["kind"],
  label: string,
  text: string,
  equivalence: Requirement["equivalence"] = "unknown",
): Requirement {
  return { id, kind, label, text, equivalence, sourceQuote: text };
}

function makePosting(overrides: Partial<JobPosting> = {}): JobPosting {
  return {
    id: "jd-1",
    sourceType: "paste",
    body: "가상 공고 본문입니다. 핵심 게임 기능 구현과 성능 문제 해결, 출시 품질 책임을 맡습니다. 포트폴리오를 함께 받습니다.",
    company: "루멘플레이 스튜디오",
    roleTitle: "Senior Unity Gameplay Engineer",
    responsibilities: [
      "핵심 게임 기능을 설계하고 구현합니다.",
      "게임 성능 문제를 분석하고 최적화합니다.",
      "출시 품질을 책임집니다.",
    ],
    requirements: [
      req("r1", "must", "상용 게임 개발 5년", "상용 게임 개발 경력 5년 이상"),
      req("r2", "must", "Unity·C# 핵심 기능 구현", "Unity 와 C# 으로 핵심 기능을 설계하고 구현한 경험"),
      req("r3", "must", "성능 분석·최적화", "성능 분석과 최적화를 직접 수행한 경험"),
      req("r4", "preferred", "장기 라이브 운영", "장기 라이브 운영과 패치 대응 경험"),
      req("r5", "preferred", "블록체인 스마트컨트랙트 감사", "블록체인 스마트컨트랙트 감사 이력"),
    ],
    idealCandidate: {
      oneLine: "핵심 게임 기능을 만들고, 성능 문제를 해결하며, 출시까지 책임지는 개발자.",
      coreTasks: [
        { id: "t1", task: "게임 기능 구현", expectedOutcome: "요구 기능의 독립 구현" },
        { id: "t2", task: "성능 문제 해결", expectedOutcome: "전후 측정이 재현되는 개선" },
        { id: "t3", task: "출시 품질 책임", expectedOutcome: "릴리스 기록과 본인 결정" },
      ],
      responsibilityLevel: "independent",
      responsibilityNote: "독립 수행을 기대합니다.",
      rationale: [],
    },
    reviewFlags: [],
    confirmedByUser: true,
    ...overrides,
  };
}

function exp(overrides: Partial<ExperienceItem> & Pick<ExperienceItem, "id">): ExperienceItem {
  return {
    kind: "job",
    organization: "조직",
    title: "직함",
    start: "2020-01",
    end: "2021-01",
    summary: "",
    tasks: [],
    outcomes: [],
    ownRole: "",
    responsibilityLevel: "independent",
    artifacts: [],
    skills: [],
    confidence: "confirmed",
    ...overrides,
  };
}

function makeProfile(overrides: Partial<ApplicantProfile> = {}): ApplicantProfile {
  return {
    id: "profile-1",
    name: "한서준",
    headline: "Unity / C# 개발자",
    contact: { email: "seojun@example.com", location: "서울" },
    links: [],
    experiences: [
      exp({
        id: "e-game",
        kind: "job",
        organization: "픽셀브릿지",
        title: "게임 클라이언트 개발자",
        start: "2025-09",
        end: "2026-08",
        summary: "상용 게임의 퀘스트 기능을 맡았습니다.",
        tasks: [
          "상용 게임의 퀘스트 UI 와 데이터 연동 기능을 구현했습니다",
          "기획·아트·QA 와 협업하며 코드 리뷰를 진행했습니다",
        ],
        outcomes: ["게임 업데이트 2회에 참여했습니다"],
        ownRole: "퀘스트 기능 구현 담당",
        responsibilityLevel: "independent",
        skills: ["Unity", "C#"],
      }),
      exp({
        id: "e-viewer",
        kind: "job",
        organization: "노바인더스트리",
        title: "C# 3D 소프트웨어 개발자",
        start: "2023-09",
        end: "2025-08",
        summary: "산업용 3D 뷰어를 개발했습니다.",
        tasks: ["산업용 3D 뷰어의 기능 개발과 배포, 장애로그 대응을 수행했습니다"],
        outcomes: ["동일 내부 테스트 장면의 로딩 시간을 4.0초에서 3.0초로 개선했습니다"],
        ownRole: "성능 개선 단독 수행",
        responsibilityLevel: "independent",
        artifacts: ["전후 측정 기록"],
        skills: ["C#", "3D", "성능", "최적화"],
      }),
      exp({
        id: "e-jam",
        kind: "competition",
        organization: "인디게임잼",
        title: "클라이언트 담당",
        start: "2024-06",
        end: "2024-06",
        summary: "4인 팀 게임잼 참여",
        tasks: ["플레이어 이동과 UI 를 구현했습니다", "동료 1명의 Git 사용을 지원했습니다"],
        outcomes: [],
        ownRole: "클라이언트 구현",
        responsibilityLevel: "participate",
        skills: ["Unity"],
      }),
      exp({
        id: "e-degree",
        kind: "degree",
        organization: "한국대학교",
        title: "컴퓨터공학 학사",
        start: "2019-03",
        end: "2023-02",
        summary: "컴퓨터공학 전공",
        ownRole: "학부 과정",
        responsibilityLevel: "participate",
      }),
    ],
    reviewFlags: [],
    confirmedByUser: true,
    ...overrides,
  };
}

const posting = makePosting();
const profile = makeProfile();

/* ──────────────────────────────────── 테스트 */

describe("assignWeights — 부문 비중", () => {
  it("합이 정확히 100 이 된다", () => {
    const cases: ("must" | "preferred" | "general")[][] = [
      ["must"],
      ["must", "preferred"],
      ["must", "must", "preferred", "preferred", "general"],
      Array.from({ length: 17 }, (_, i) => (i % 3 === 0 ? "must" : i % 3 === 1 ? "preferred" : "general")),
    ];
    for (const kinds of cases) {
      const w = assignWeights(kinds);
      expect(w).toHaveLength(kinds.length);
      expect(w.reduce((a, b) => a + b, 0)).toBe(100);
      expect(w.every((n) => Number.isInteger(n) && n >= 1)).toBe(true);
    }
  });

  it("필수 부문이 우대 부문보다 크다", () => {
    const kinds: ("must" | "preferred" | "general")[] = [
      "preferred",
      "preferred",
      "must",
      "must",
      "general",
    ];
    const w = assignWeights(kinds);
    const musts = w.filter((_, i) => kinds[i] === "must");
    const prefs = w.filter((_, i) => kinds[i] === "preferred");
    expect(Math.min(...musts)).toBeGreaterThan(Math.max(...prefs));
  });
});

describe("buildDimensions — 3단계 매핑", () => {
  const dimensions = buildDimensions(posting, profile);

  it("requirement 하나당 부문 하나를 만들고 비중 합은 100 이다", () => {
    for (const r of posting.requirements) {
      expect(dimensions.filter((d) => d.requirementId === r.id)).toHaveLength(1);
    }
    expect(dimensions.reduce((a, d) => a + d.weight, 0)).toBe(100);
    // 포트폴리오 general 부문이 더해진다
    expect(dimensions.some((d) => d.kind === "general")).toBe(true);
  });

  it("모든 부문에서 current <= afterStory <= target 이다", () => {
    for (const d of dimensions) {
      expect(d.current).toBeLessThanOrEqual(d.afterStory);
      expect(d.afterStory).toBeLessThanOrEqual(d.target);
    }
  });

  it("점수는 허용된 이산 단계(0/20/25/50/75/100)만 쓴다", () => {
    for (const d of dimensions) {
      expect(ALLOWED_LEVELS).toContain(d.current);
      expect(ALLOWED_LEVELS).toContain(d.afterStory);
      expect(ALLOWED_LEVELS).toContain(d.target);
    }
  });

  it("연결할 관련 경험이 없으면 afterStory 가 current 와 같다 (문장만으로 오르지 않는다)", () => {
    const none = dimensions.find((d) => d.requirementId === "r5");
    expect(none).toBeDefined();
    expect(none?.current).toBe(0);
    expect(none?.afterStory).toBe(none?.current);
    expect(none?.usedExperienceIds).toHaveLength(0);
    expect(none?.confidence).toBe("needs-confirmation");
  });

  it("경력 연수 부문은 목표에 미래 개월 수를 더하지 않아 target 이 current 와 같다", () => {
    const tenure = dimensions.find((d) => d.requirementId === "r1");
    expect(tenure).toBeDefined();
    // 요구 5년(60개월) 대비 게임 영역 재직 12개월 → 20%
    expect(tenure?.current).toBe(20);
    expect(tenure?.target).toBe(tenure?.current);
    expect(tenure?.targetCaveat).toContain("별도 장기 과제");
  });

  it("다른 도메인의 재직 경력은 연수의 직접 근거로 치지 않는다", () => {
    const evidence = buildEvidenceIndex(posting, profile);
    const tenure = dimensions.find((d) => d.requirementId === "r1");
    const ev = evidence.get(tenure?.id ?? "");
    expect(ev?.direct).toEqual(["e-game"]);
    expect(ev?.related).toContain("e-viewer");
  });

  it("관련 경험이 있으면 한 단계 오르되 관련 근거만으로 100% 를 주장하지 않는다", () => {
    const unity = dimensions.find((d) => d.requirementId === "r2");
    expect(unity?.current).toBe(50); // 게임 영역에서 독립 수행
    expect(unity?.afterStory).toBe(75); // 비게임 C#·게임잼 연결
    expect(unity?.afterStory).toBeLessThanOrEqual(75);
  });

  it("학위는 실무 연수로 환산되지 않는다", () => {
    const months = defaultProfessionalMonths(profile.experiences, "2026-08");
    // 재직 경력 e-game(12) + e-viewer(24) = 36개월. 학사 4년은 포함되지 않는다.
    expect(months).toBe(36);
  });

  it("연수 요구와 도메인 앵커를 읽는다 / 신입 공고에는 연수 항목을 만들지 않는다", () => {
    expect(parseTenure(posting.requirements[0])).toMatchObject({ requiredMonths: 60 });
    expect(domainAnchors(posting)).toContain("게임");
    const junior = req("r0", "must", "신입 지원 가능", "신입 지원 가능, 경력 무관");
    expect(parseTenure(junior)).toBeNull();
  });
});

describe("buildStories — 경험 스토리", () => {
  const dimensions = buildDimensions(posting, profile);
  const stories = buildStories(dimensions, profile, posting);

  it("afterStory 가 오른 부문에만 이야기를 만든다", () => {
    const raised = dimensions.filter((d) => d.afterStory > d.current);
    expect(stories.length).toBeGreaterThan(0);
    expect(stories.length).toBeLessThanOrEqual(raised.length);
    for (const s of stories) {
      const dim = dimensions.find((d) => d.id === s.dimensionId);
      expect(dim?.afterStory).toBeGreaterThan(dim?.current ?? 0);
      expect(s.from).toBe(dim?.current);
      expect(s.to).toBe(dim?.afterStory);
    }
  });

  it("이력서 문장은 실제 경험의 사실에서 나오고 한계를 함께 적는다", () => {
    const allFacts = profile.experiences.flatMap((e) => [...e.outcomes, ...e.tasks, e.summary, e.ownRole]);
    for (const s of stories) {
      expect(s.usedExperienceIds.length).toBeGreaterThan(0);
      expect(allFacts.some((f) => f && s.resumeSentence.includes(f))).toBe(true);
      expect(s.scopeAndLimit).toContain(`${s.from}% → ${s.to}%`);
    }
  });
});

describe("buildActions — 실행 과제", () => {
  const dimensions = buildDimensions(posting, profile);
  const actions = buildActions(dimensions, posting);

  it("target 이 afterStory 보다 높은 부문마다 6가지 항목을 모두 채운다", () => {
    const gaps = dimensions.filter((d) => d.target > d.afterStory);
    expect(actions).toHaveLength(gaps.length);
    for (const a of actions) {
      expect(a.gap.length).toBeGreaterThan(0);
      expect(a.to).toBeGreaterThan(a.from);
      expect(a.actions.length).toBeGreaterThan(0);
      expect(a.evidence.length).toBeGreaterThan(0);
      expect(a.conditions.length).toBeGreaterThan(0);
      expect(a.reassessCriteria).toContain("재평가");
      expect([1, 2, 3]).toContain(a.priority);
      // 체크만으로 점수를 주지 않는다 — 시작 상태는 항상 todo
      expect(a.status).toBe("todo");
      expect(a.savedToPlan).toBe(false);
    }
  });

  it("경력 연수 부문은 실행 과제를 만들지 않는다 (target 이 오르지 않기 때문)", () => {
    const tenure = dimensions.find((d) => d.requirementId === "r1");
    expect(actions.some((a) => a.dimensionId === tenure?.id)).toBe(false);
  });
});

describe("buildEnrichmentQuestions — 추가 질문", () => {
  it("근거가 부족한 부문 3~5개에 대해 구체적으로 묻는다", () => {
    const dimensions = buildDimensions(posting, profile);
    const questions = buildEnrichmentQuestions(dimensions, posting);
    expect(questions.length).toBeGreaterThanOrEqual(3);
    expect(questions.length).toBeLessThanOrEqual(5);
    for (const q of questions) {
      expect(dimensions.some((d) => d.id === q.dimensionId)).toBe(true);
      expect(q.question.endsWith("?")).toBe(true);
      expect(q.answerState).toBe("unanswered");
      expect(q.why.length).toBeGreaterThan(0);
    }
  });
});

describe("buildReport — 분석서 조립", () => {
  const report = buildReport(posting, profile);

  it("총점은 부문 가중 평균과 일치하고 읽는 법을 함께 담는다", () => {
    expect(report.overall).toEqual(computeOverall(report.dimensions));
    expect(report.readingNote).toBe(READING_NOTE);
    expect(report.visibility).toBe("private");
    expect(report.generatedBy).toBe("heuristic");
    expect(report.overall.display.current).toBeLessThanOrEqual(report.overall.display.afterStory);
    expect(report.overall.display.afterStory).toBeLessThanOrEqual(report.overall.display.target);
  });

  it("필수 조건 상태는 총점과 별개로 남고, 연수 조건은 판단 문구에 따로 표시된다", () => {
    expect(report.mustHaveStatus).toHaveLength(
      posting.requirements.filter((r) => r.kind === "must").length,
    );
    expect(report.verdictNote).toContain("별도 확인이 필요합니다");
  });

  it("같은 입력이면 항상 같은 결과를 낸다 (결정적 출력)", () => {
    const again = buildReport(posting, profile);
    expect(JSON.stringify(again)).toBe(JSON.stringify(report));
  });
});
