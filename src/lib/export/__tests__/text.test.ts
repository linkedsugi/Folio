/**
 * 평문 내보내기 회귀 테스트.
 *
 * 여기서 지키는 선은 문서 서식이 아니라 **사실**이다.
 *  - 사용자가 뺀 문장(excluded)은 어떤 판본에서도 나가지 않는다.
 *  - 아직 하지 않은 계획(basis==='planned')은 이력서 1·2 에 절대 들어가지 않는다.
 *  - 그 계획은 이력서 3 에만, [예정] 표시와 제출 불가 경고와 함께 남는다.
 */
import { describe, expect, it } from "vitest";
import type {
  ActionCard,
  ApplicantProfile,
  CandidacyCase,
  JobPosting,
  MatchDimension,
  ResumeDocument,
  ResumeEntry,
  ResumeLine,
  ResumeSection,
  ResumeVariant,
  StoryCard,
  StrategyReport,
} from "@/lib/types";
import { FUTURE_WARNING, reportToMarkdown, resumeToPlainText } from "../text";

/* ───────────────────────────────── 픽스처 */

function line(
  id: string,
  text: string,
  basis: ResumeLine["basis"] = "direct",
  status: ResumeLine["status"] = "adopted",
): ResumeLine {
  return { id, text, original: text, status, basis };
}

const EXCLUDED_TEXT = "사내 동호회 총무를 맡았습니다";
const PLANNED_TEXT = "[예정] 개인 프로젝트를 스토어에 출시하고 운영 지표를 기록합니다";
const DIRECT_TEXT = "퀘스트 UI 와 데이터 연동 기능을 구현했습니다";
const RELATED_TEXT = "산업용 3D 뷰어에서 로딩 시간을 4.0초에서 3.0초로 개선했습니다";

function entry(over: Partial<ResumeEntry> & { id: string }): ResumeEntry {
  return {
    organization: "루멘플레이",
    title: "Unity 클라이언트 개발자",
    period: "2025.09–2026.08",
    lines: [],
    ...over,
  };
}

function section(over: Partial<ResumeSection> & { id: string; kind: ResumeSection["kind"] }): ResumeSection {
  return {
    heading: "제목",
    lines: [],
    entries: [],
    included: true,
    ...over,
  };
}

/** 세 판본이 같은 재료에서 나온다는 것을 보이려고, 문장 묶음을 한 벌만 만든다. */
function resume(variant: ResumeVariant, over: Partial<ResumeDocument> = {}): ResumeDocument {
  return {
    id: `resume-${variant}`,
    variant,
    jobPostingId: "jd-1",
    profileId: "profile-1",
    docType: "resume",
    language: "ko",
    templateId: "technical-evidence",
    versionLabel: `루멘플레이 · Unity 클라이언트 개발자 · ${variant}`,
    header: {
      name: "한서준",
      headline: "Unity·C# 클라이언트 개발자",
      contactLine: "seojun@example.com | 010-0000-0000 | 서울",
    },
    targetPages: 2,
    factsConfirmed: true,
    narrative: {
      matchScore: 45,
      headline: "관련 경험을 연결하면 이만큼 설명됩니다",
      readsAs: ["상용 게임 개발 참여"],
      remainingGap: ["출시 전 과정 책임"],
      interviewAngle: "비게임 3D 경험을 성능 관점에서 설명합니다",
    },
    sections: [
      section({
        id: "s-summary",
        kind: "summary",
        heading: "핵심 요약",
        lines: [
          line("l-sum", "상용 Unity 게임 개발 1년과 C# 3D 솔루션 개발 2년의 경험이 있습니다"),
          line("l-sum-x", EXCLUDED_TEXT, "direct", "excluded"),
        ],
      }),
      section({
        id: "s-exp",
        kind: "experience",
        heading: "경력·성과",
        entries: [
          entry({
            id: "e-1",
            lines: [
              line("l-1", DIRECT_TEXT),
              line("l-1x", EXCLUDED_TEXT, "direct", "excluded"),
              line("l-1p", PLANNED_TEXT, "planned"),
            ],
          }),
          entry({
            id: "e-2",
            organization: "다온소프트",
            title: "소프트웨어 엔지니어",
            period: "2023.09–2025.08",
            lines: [line("l-2", RELATED_TEXT, "related")],
          }),
          entry({
            id: "e-plan",
            organization: "개인 프로젝트",
            title: "출시·운영",
            period: "예정",
            planned: true,
            lines: [line("l-3p", PLANNED_TEXT, "planned")],
          }),
        ],
      }),
    ],
    ...over,
  };
}

function dimension(over: Partial<MatchDimension> & { id: string; label: string }): MatchDimension {
  return {
    kind: "general",
    weight: 50,
    current: 25,
    afterStory: 50,
    target: 75,
    teamExpectation: "Unity 핵심 기능을 직접 구현한다",
    currentBasis: "퀘스트 UI 구현 경험",
    storyBasis: "비게임 3D 최적화 경험",
    nextStep: "개인 프로젝트 출시",
    evidenceToProduce: "스토어 링크와 운영 지표",
    remainingGap: "상용 라이브 운영 경험",
    rationale: [
      {
        claim: "핵심 기능 구현 경험이 부분적으로 확인된다",
        evidence: [{ source: "jd", refId: "jd-1", quote: "Unity·C# 핵심 기능 구현" }],
        interpretation: "직접 구현한 범위가 UI·데이터 연동에 머문다",
      },
    ],
    usedExperienceIds: ["exp-1"],
    confidence: "confirmed",
    storyLift: "lifted",
    ...over,
  };
}

const CANDIDACY_NOW_LIMIT = "상용 라이브 서비스의 장기 운영 경험은 여전히 없습니다";
const CANDIDACY_FUTURE_LIMIT = "출시 규모는 개인 프로젝트 수준에 머뭅니다";

function candidacy(stage: CandidacyCase["stage"], honestLimit: string): CandidacyCase {
  return {
    stage,
    headline:
      stage === "now"
        ? "Unity 상용 개발과 3D 성능 개선을 함께 설명할 수 있는 지원자입니다"
        : "출시·운영까지 직접 맡아 본 지원자가 됩니다",
    reasonsToConsider: [
      "퀘스트 UI·데이터 연동을 직접 구현했습니다",
      "비게임 3D 환경에서 로딩 시간을 측정 가능한 수준으로 줄였습니다",
    ],
    concerns: [
      {
        concern: "게임 개발 경력 5년 요건에 미치지 못합니다",
        response: "게임 1년과 C#·3D 2년을 합쳐 엔진·성능 관점에서 설명합니다",
        evidenceIds: ["exp-1", "exp-2"],
        honestLimit,
      },
    ],
    conditions: ["동등 경험 인정 여부를 공고 담당자에게 확인할 것"],
    caution: "이 이야기는 실제 채용 결과를 예측한 것이 아닙니다.",
  };
}

const TARGET_SENTENCE_1 = "출시 전 과정에서 빌드·스토어 등록·운영 지표 수집을 직접 수행했습니다";
const TARGET_SENTENCE_2 = "프로파일링으로 프레임 저하 원인을 찾아 30% 개선했습니다";

function action(over: Partial<ActionCard> & { id: string; targetSentence: string }): ActionCard {
  return {
    dimensionId: "d-1",
    priority: 2,
    experienceNeeded: "직접 출시까지 수행한 프로젝트 한 건",
    gap: "출시 전 과정 책임 경험",
    from: 25,
    to: 75,
    actions: ["개인 프로젝트를 스토어에 등록"],
    evidence: ["스토어 링크", "운영 지표 기록"],
    conditions: ["주말 시간 확보"],
    reassessCriteria: "출시 링크와 2주간 지표가 확인되면 재평가",
    status: "todo",
    savedToPlan: true,
    ...over,
  };
}

function story(over: Partial<StoryCard> & { id: string }): StoryCard {
  return {
    dimensionId: "d-1",
    teamExpectation: "Unity 핵심 기능을 직접 구현한다",
    usedExperience: "산업용 3D 뷰어 로딩 최적화",
    usedExperienceIds: ["exp-2"],
    connectionLogic: "같은 C#·3D 런타임에서 병목을 측정하고 줄인 경험",
    evidence: ["로딩 4.0초 → 3.0초"],
    resumeSentence: RELATED_TEXT,
    interviewNote: "게임이 아닌 환경이었음을 먼저 밝히고 측정 방법을 설명합니다",
    scopeAndLimit: "게임 런타임의 프레임 최적화와는 다릅니다",
    from: 25,
    to: 50,
    adopted: true,
    ...over,
  };
}

const READING_NOTE = "요약을 먼저 읽고, 근거와 과제는 필요할 때 펼쳐 보세요.";

const POSTING: JobPosting = {
  id: "jd-1",
  sourceType: "paste",
  body: "Unity 클라이언트 개발자를 모집합니다.",
  company: "루멘플레이",
  team: "클라이언트 1팀",
  roleTitle: "Unity 클라이언트 개발자",
  responsibilities: ["핵심 기능 구현", "성능 최적화"],
  requirements: [
    {
      id: "r-1",
      kind: "must",
      label: "게임 개발 5년",
      text: "게임 개발 경력 5년 이상",
      equivalence: "unknown",
      sourceQuote: "게임 개발 경력 5년 이상 | 무관 경력은 별도 문의",
      derivation: "stated",
    },
    {
      id: "r-2",
      kind: "preferred",
      label: "출시 경험",
      text: "출시 전 과정을 맡아 본 경험",
      equivalence: "allowed",
      sourceQuote: "출시 과정에서 맡은 부분을 책임질 수 있는 분",
      derivation: "inferred",
      inferenceNote: "책임 범위를 묻는 문장으로 읽었습니다",
    },
  ],
  idealCandidate: {
    oneLine: "출시까지 자기 몫을 책임지는 Unity 클라이언트 개발자",
    coreTasks: [
      { id: "t-1", task: "핵심 기능 구현", expectedOutcome: "주요 시스템의 안정적 동작" },
    ],
    responsibilityLevel: "independent",
    responsibilityNote: "맡은 기능을 혼자 끝까지 끌고 갈 수 있어야 합니다",
    rationale: [
      {
        claim: "출시 책임을 중요하게 본다",
        evidence: [
          { source: "jd", refId: "jd-1", quote: "출시 과정에서 맡은 부분을 책임질 수 있는 분" },
        ],
        interpretation: "참여가 아니라 독립 수행을 기대한다고 읽었습니다",
      },
    ],
  },
  reviewFlags: [],
  confirmedByUser: true,
};

const PROFILE: ApplicantProfile = {
  id: "profile-1",
  name: "한서준",
  headline: "Unity·C# 클라이언트 개발자",
  contact: { email: "seojun@example.com" },
  links: [],
  experiences: [],
  reviewFlags: [],
  confirmedByUser: true,
};

const REPORT: StrategyReport = {
  id: "report-1",
  jobPostingId: "jd-1",
  profileId: "profile-1",
  idealCandidate: POSTING.idealCandidate,
  overall: {
    raw: { current: 32.75, afterStory: 45.25, target: 71.5 },
    display: { current: 33, afterStory: 45, target: 72 },
  },
  dimensions: [
    dimension({ id: "d-1", label: "Unity·C# 핵심 기능 구현" }),
    dimension({
      id: "d-2",
      label: "출시 전 과정 책임 | 운영",
      weight: 50,
      current: 0,
      afterStory: 0,
      target: 75,
      storyLift: "no-related-experience",
      confidence: "needs-confirmation",
      targetCaveat: "필수 조건인 경력 연수는 목표에서도 채워지지 않습니다",
    }),
  ],
  stories: [story({ id: "st-1" })],
  actions: [
    action({ id: "a-1", targetSentence: TARGET_SENTENCE_1, priority: 3 }),
    action({ id: "a-2", targetSentence: TARGET_SENTENCE_2, priority: 1 }),
  ],
  verdict: "apply-while-confirming",
  verdictNote: "동등 경험 인정 여부를 확인하면서 지원 문서를 준비하세요.",
  mustHaveStatus: [
    {
      requirementId: "r-1",
      label: "게임 개발 5년",
      state: "not-met",
      note: "게임 개발 1년으로 확인됩니다.",
    },
  ],
  candidacyNow: candidacy("now", CANDIDACY_NOW_LIMIT),
  candidacyFuture: candidacy("future", CANDIDACY_FUTURE_LIMIT),
  readingNote: READING_NOTE,
  visibility: "private",
  generatedBy: "heuristic",
};

/* ───────────────────────────────── 이력서 평문 */

describe("resumeToPlainText — 내보내면 안 되는 문장", () => {
  it("사용자가 뺀 문장(excluded)은 어느 판본에도 없다", () => {
    for (const variant of ["baseline", "story", "future"] as const) {
      expect(resumeToPlainText(resume(variant))).not.toContain(EXCLUDED_TEXT);
    }
  });

  it("계획 문장(basis='planned')은 이력서 1(baseline)에 없다", () => {
    const text = resumeToPlainText(resume("baseline"));
    expect(text).not.toContain(PLANNED_TEXT);
    expect(text).not.toContain("[예정]");
  });

  it("계획 문장은 제출용인 이력서 2(story)에도 없다", () => {
    const text = resumeToPlainText(resume("story"));
    expect(text).not.toContain(PLANNED_TEXT);
    expect(text).not.toContain("[예정]");
  });

  it("계획만 있는 항목은 이력서 1·2 에서 통째로 빠진다", () => {
    expect(resumeToPlainText(resume("baseline"))).not.toContain("개인 프로젝트");
    expect(resumeToPlainText(resume("story"))).not.toContain("개인 프로젝트");
  });

  it("이력서 3(future)에는 [예정] 문장이 남고, 제출 불가 경고가 머리말에 붙는다", () => {
    const text = resumeToPlainText(resume("future"));
    expect(text).toContain(PLANNED_TEXT);
    expect(text).toContain(FUTURE_WARNING);
    expect(text).toContain("개인 프로젝트");
  });
});

describe("resumeToPlainText — 형식", () => {
  it("항목은 '조직 | 직함 | 기간' 한 줄 뒤에 불릿이 온다", () => {
    const lines = resumeToPlainText(resume("story")).split("\n");
    const at = lines.indexOf("루멘플레이 | Unity 클라이언트 개발자 | 2025.09–2026.08");
    expect(at).toBeGreaterThan(-1);
    expect(lines[at + 1]).toBe(`- ${DIRECT_TEXT}`);
  });

  it("섹션 제목은 문서 언어를 따른다", () => {
    expect(resumeToPlainText(resume("story"))).toContain("경력·성과");
    const english = resumeToPlainText(resume("story", { language: "en" }));
    expect(english).toContain("Experience");
    expect(english).not.toContain("경력·성과");
  });

  it("이력서 평문에는 매칭률이 들어가지 않는다 — 이력서와 분석서는 분리한다", () => {
    const text = resumeToPlainText(resume("story"));
    expect(text).not.toContain("매칭률");
    expect(text).not.toMatch(/\d+%/);
  });

  it("included=false 섹션은 내보내지 않는다", () => {
    const doc = resume("story");
    const hidden = {
      ...doc,
      sections: doc.sections.map((s) => (s.kind === "summary" ? { ...s, included: false } : s)),
    };
    expect(resumeToPlainText(hidden)).not.toContain("상용 Unity 게임 개발 1년");
  });

  it("같은 문서를 두 번 내보내면 결과가 같다", () => {
    expect(resumeToPlainText(resume("story"))).toBe(resumeToPlainText(resume("story")));
  });
});

/* ───────────────────────────────── 분석서 마크다운 */

describe("reportToMarkdown — 기획서 07 의 구성", () => {
  const md = reportToMarkdown(REPORT, POSTING, PROFILE);

  it("인재상 한 문장이 들어간다", () => {
    expect(md).toContain(POSTING.idealCandidate.oneLine);
  });

  it("매칭 3단계 수치가 모두 들어간다", () => {
    expect(md).toContain("33%");
    expect(md).toContain("45%");
    expect(md).toContain("72%");
  });

  it("부문별 비교표에 모든 부문이 한 행씩 들어가고, 칸 안의 파이프는 표를 깨뜨리지 않는다", () => {
    expect(md).toContain("| 모집팀의 기대 | 비중 | 현재 | 스토리 후 | 목표 |");
    expect(md).toContain("Unity·C# 핵심 기능 구현");
    // 라벨에 들어 있던 '|' 는 이스케이프되어야 한다.
    expect(md).toContain("출시 전 과정 책임 \\| 운영");
  });

  it("필수 조건은 총점과 따로 표시된다", () => {
    expect(md).toContain("필수 조건 — 총점과 별개의 정보");
    expect(md).toContain("[미충족]");
    expect(md).toContain("게임 개발 5년");
  });

  it("지금 지원할 때의 합격 가능성 스토리가 세 부분 모두 들어간다", () => {
    expect(md).toContain("이 팀이 나를 검토할 이유");
    expect(md).toContain("우려와, 내 경험으로 답하는 방법");
    expect(md).toContain("지금 지원을 검토할 조건");
    expect(md).toContain(REPORT.candidacyNow.headline);
  });

  it("우려마다 '그래도 남는 것'(honestLimit)이 빠지지 않는다", () => {
    expect(md).toContain(`그래도 남는 것: ${CANDIDACY_NOW_LIMIT}`);
    expect(md).toContain(`그래도 남는 것: ${CANDIDACY_FUTURE_LIMIT}`);
    const limits = md.match(/그래도 남는 것:/g) ?? [];
    expect(limits.length).toBe(
      REPORT.candidacyNow.concerns.length + REPORT.candidacyFuture.concerns.length,
    );
  });

  it("경험 스토리에 이력서 문장과 한계가 함께 들어간다", () => {
    expect(md).toContain(`이력서 문장: ${RELATED_TEXT}`);
    expect(md).toContain("보완 범위와 한계");
  });

  it("실행 계획에 각 과제의 targetSentence 가 들어간다", () => {
    expect(md).toContain(TARGET_SENTENCE_1);
    expect(md).toContain(TARGET_SENTENCE_2);
    expect(md).toContain("재평가 기준");
  });

  it("스토리텔링에서 값이 움직이지 않은 이유를 남긴다", () => {
    expect(md).toContain("연결할 경험이 아직 없음");
    expect(md).toContain("이미 가진 경험을 연결해 설명할 수 있는 수준입니다");
  });

  it("문서 끝에 readingNote 와 '합격확률이 아닌 직무 매칭률' 각주가 있다", () => {
    expect(md).toContain(READING_NOTE);
    expect(md).toContain("직무 매칭률");
    expect(md).toContain("합격 확률이나 서류 통과율이 아니며");
  });

  it("같은 입력이면 같은 결과가 나온다 — 시각에 흔들리지 않는다", () => {
    expect(reportToMarkdown(REPORT, POSTING, PROFILE)).toBe(md);
  });
});
