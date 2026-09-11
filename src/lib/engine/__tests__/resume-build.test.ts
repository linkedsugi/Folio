/**
 * 3판본 이력서 생성기 검증.
 * 픽스처는 이 파일 안에서 직접 만든 가상 JD / 가상 이력이다.
 */
import { describe, expect, it } from "vitest";

import type {
  ApplicantProfile,
  ExperienceItem,
  JobPosting,
  Requirement,
  ResumeDocument,
  ResumeLine,
} from "../../types";
import { RESUME_VARIANT_META, SECTION_LABEL } from "../../types";
import { buildReport } from "../match";
import { EN_BODY_CAUTION, PLANNED_PREFIX, buildResumeSet, rebuildAfterEdit } from "../resume-build";

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
    body: "가상 공고입니다. 핵심 게임 기능 구현과 성능 최적화를 맡습니다. 포트폴리오를 함께 받습니다.",
    company: "루멘플레이 스튜디오",
    roleTitle: "Senior Unity Gameplay Engineer",
    responsibilities: ["핵심 게임 기능 구현", "게임 성능 분석과 최적화"],
    requirements: [
      req("r1", "must", "상용 게임 개발 5년", "상용 게임 개발 경력 5년 이상"),
      req("r2", "must", "Unity·C# 핵심 기능 구현", "Unity 와 C# 으로 핵심 기능을 구현한 경험"),
      req("r3", "must", "성능 분석·최적화", "성능 분석과 최적화를 직접 수행한 경험"),
      req("r4", "preferred", "주니어 멘토링", "주니어 멘토링과 온보딩 지원 경험"),
    ],
    idealCandidate: {
      oneLine: "핵심 게임 기능을 만들고 성능 문제를 해결하는 개발자.",
      coreTasks: [{ id: "t1", task: "게임 기능 구현", expectedOutcome: "독립 구현" }],
      responsibilityLevel: "independent",
      responsibilityNote: "독립 수행",
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
    contact: { email: "seojun@example.com" },
    links: [],
    experiences: [
      exp({
        id: "e-game",
        organization: "픽셀브릿지",
        title: "게임 클라이언트 개발자",
        start: "2025-09",
        end: "2026-08",
        summary: "상용 게임 퀘스트 기능 담당",
        tasks: ["상용 게임의 퀘스트 UI 와 데이터 연동 기능을 구현했습니다"],
        outcomes: ["게임 업데이트 2회에 참여했습니다"],
        ownRole: "퀘스트 기능 구현 담당",
        skills: ["Unity", "C#"],
      }),
      exp({
        id: "e-viewer",
        organization: "노바인더스트리",
        title: "C# 3D 소프트웨어 개발자",
        start: "2023-09",
        end: "2025-08",
        summary: "산업용 3D 뷰어 개발",
        tasks: ["산업용 3D 뷰어의 기능 개발과 배포를 수행했습니다"],
        outcomes: ["동일 내부 테스트 장면의 로딩 시간을 4.0초에서 3.0초로 개선했습니다"],
        ownRole: "성능 개선 단독 수행",
        artifacts: ["전후 측정 기록"],
        skills: ["C#", "성능", "최적화"],
      }),
      exp({
        id: "e-paper",
        kind: "publication",
        organization: "한국그래픽스학회",
        title: "실시간 렌더링 최적화 사례 연구",
        start: "2024-05",
        end: "2024-05",
        summary: "최적화 사례를 정리한 논문",
        tasks: ["렌더링 최적화 사례를 정리했습니다"],
        ownRole: "제1저자",
        responsibilityLevel: "lead",
        publicationStatus: "under-review",
      }),
      exp({
        id: "e-degree",
        kind: "degree",
        organization: "한국대학교",
        title: "컴퓨터공학 학사",
        start: "2019-03",
        end: "2023-02",
        summary: "컴퓨터공학 전공",
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
const report = buildReport(posting, profile);

function allLines(doc: ResumeDocument): ResumeLine[] {
  return doc.sections.flatMap((s) => [...s.lines, ...s.entries.flatMap((e) => e.lines)]);
}

/* ──────────────────────────────────── 테스트 */

describe("buildResumeSet — 세 판본의 관계", () => {
  const set = buildResumeSet(posting, profile, report, { templateId: "technical-evidence" });

  it("제출용 기본은 이력서 2(story) 이고 future 는 선택할 수 없다", () => {
    expect(set.submitVariant).toBe("story");
    expect(set.active).toBe("story");
    expect(RESUME_VARIANT_META[set.future.variant].submittable).toBe(false);
  });

  it("baseline 에는 direct 문장만 있고 planned 문장이 없다", () => {
    const lines = allLines(set.baseline);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((l) => l.basis === "planned")).toBe(false);
    expect(lines.some((l) => l.basis === "related")).toBe(false);
    expect(lines.every((l) => !l.text.startsWith(PLANNED_PREFIX))).toBe(true);
  });

  it("story 는 baseline 을 확장하고 related 문장을 더한다", () => {
    const baselineLines = allLines(set.baseline);
    const storyLines = allLines(set.story);
    expect(storyLines.length).toBeGreaterThanOrEqual(baselineLines.length);
    expect(storyLines.some((l) => l.basis === "related")).toBe(true);
    expect(storyLines.some((l) => l.basis === "planned")).toBe(false);
  });

  it("story 의 문장이 StoryCard.resumeSentence 와 일치한다", () => {
    const related = allLines(set.story).filter((l) => l.basis === "related");
    expect(report.stories.length).toBeGreaterThan(0);
    const strip = (s: string) => s.replace(/\.$/, "").replace(/\s+/g, " ").trim();

    for (const story of report.stories) {
      const primaryId = story.usedExperienceIds[0];
      const line = related.find(
        (l) => l.experienceId === primaryId && strip(l.text) === strip(story.resumeSentence),
      );
      // 분석서에서 채택한 문장이 그대로 이력서 2 에 들어간다 (두 결과물이 일치해야 한다)
      expect(line).toBeDefined();
      expect(line?.dimensionId).toBe(story.dimensionId);
    }
    // 항목에 실린 related 문장은 모두 실제 경험에서 나온다
    const entryRelated = set.story.sections
      .flatMap((s) => s.entries)
      .flatMap((e) => e.lines)
      .filter((l) => l.basis === "related");
    expect(entryRelated.length).toBeGreaterThan(0);
    expect(entryRelated.every((l) => Boolean(l.experienceId))).toBe(true);
  });

  it("future 의 planned 문장은 모두 '[예정] ' 로 시작하고 예정 항목은 planned 로 표시된다", () => {
    const planned = allLines(set.future).filter((l) => l.basis === "planned");
    expect(planned.length).toBeGreaterThan(0);
    for (const l of planned) {
      expect(l.text.startsWith(PLANNED_PREFIX)).toBe(true);
      expect(l.original.startsWith(PLANNED_PREFIX)).toBe(true);
    }
    for (const section of set.future.sections) {
      for (const entry of section.entries) {
        if (!entry.planned) continue;
        expect(entry.lines.every((l) => l.basis === "planned")).toBe(true);
      }
    }
    // 제출 가능한 두 판본에는 예정 항목이 없다
    for (const doc of [set.baseline, set.story]) {
      expect(doc.sections.every((s) => s.entries.every((e) => !e.planned))).toBe(true);
    }
  });

  it("판본별 narrative.matchScore 가 overall.display 의 각 단계와 같다", () => {
    expect(set.baseline.narrative.matchScore).toBe(report.overall.display.current);
    expect(set.story.narrative.matchScore).toBe(report.overall.display.afterStory);
    expect(set.future.narrative.matchScore).toBe(report.overall.display.target);
    expect(set.future.narrative.caution).toContain("제출할 수 없습니다");
  });

  it("기간과 실제 직함, 논문 상태를 바꾸지 않는다", () => {
    const entries = set.story.sections.flatMap((s) => s.entries);
    const game = entries.find((e) => e.experienceId === "e-game");
    expect(game?.title).toBe("게임 클라이언트 개발자");
    expect(game?.period).toBe("2025.09~2026.08");
    const paper = entries.find((e) => e.experienceId === "e-paper");
    if (paper) expect(paper.meta).toContain("심사 중");
  });

  it("이력서 문장에는 분석서의 점수를 넣지 않는다", () => {
    for (const doc of [set.baseline, set.story, set.future]) {
      for (const line of allLines(doc)) {
        expect(line.text).not.toMatch(/\d+\s*%/);
      }
    }
  });

  it("같은 입력이면 같은 출력을 낸다 (결정적)", () => {
    const again = buildResumeSet(posting, profile, report, { templateId: "technical-evidence" });
    expect(JSON.stringify(again)).toBe(JSON.stringify(set));
  });
});

describe("문서 유형·언어", () => {
  it("cv 면 연구·논문·교육 섹션을 구성한다", () => {
    const set = buildResumeSet(posting, profile, report, { docType: "cv", templateId: "academic-cv" });
    const kinds = set.story.sections.map((s) => s.kind);
    expect(kinds).toContain("research");
    expect(kinds).toContain("publications");
    expect(kinds).toContain("teaching");
    // 논문은 논문 섹션으로 간다
    const publications = set.story.sections.find((s) => s.kind === "publications");
    expect(publications?.entries.some((e) => e.experienceId === "e-paper")).toBe(true);
  });

  it("resume 이면 연구·논문·교육 섹션을 만들지 않는다", () => {
    const set = buildResumeSet(posting, profile, report, { docType: "resume", templateId: "ats-classic" });
    const kinds = set.story.sections.map((s) => s.kind);
    expect(kinds).not.toContain("research");
    expect(kinds).not.toContain("publications");
  });

  it("영문이면 섹션 제목만 영문이고 본문은 번역하지 않는다", () => {
    const set = buildResumeSet(posting, profile, report, { language: "en" });
    const summary = set.story.sections.find((s) => s.kind === "summary");
    expect(summary?.heading).toBe(SECTION_LABEL.summary.en);
    expect(set.story.narrative.caution).toContain(EN_BODY_CAUTION);
    // 본문은 한국어 그대로 남는다
    expect(allLines(set.story).some((l) => /[가-힣]/.test(l.text))).toBe(true);
  });

  it("공고가 정한 언어·분량을 사용자의 선택보다 우선한다", () => {
    const ruled = makePosting({ documentRules: { language: "en", maxPages: 1 } });
    const ruledReport = buildReport(ruled, profile);
    const set = buildResumeSet(ruled, profile, ruledReport, { language: "ko", targetPages: 3 });
    expect(set.story.language).toBe("en");
    expect(set.story.targetPages).toBe(1);
    expect(set.story.narrative.caution).toContain("공고가 정한");
  });
});

describe("rebuildAfterEdit — 문장 편집", () => {
  const set = buildResumeSet(posting, profile, report, { templateId: "technical-evidence" });

  it("사실을 고치면 같은 문장을 쓰는 다른 판본에도 반영된다", () => {
    const target = allLines(set.baseline).find((l) => l.experienceId === "e-game" && l.basis === "direct");
    expect(target).toBeDefined();
    const inStoryBefore = allLines(set.story).find((l) => l.id === target?.id);
    expect(inStoryBefore).toBeDefined();

    const next = rebuildAfterEdit(set, "baseline", target!.id, {
      text: "상용 게임의 퀘스트 UI 와 데이터 연동 기능을 구현하고 검증했습니다",
    });
    for (const doc of [next.baseline, next.story, next.future]) {
      const line = allLines(doc).find((l) => l.id === target!.id);
      expect(line?.text).toBe("상용 게임의 퀘스트 UI 와 데이터 연동 기능을 구현하고 검증했습니다.");
      expect(line?.status).toBe("edited");
      // 원래 문장은 그대로 남아 "왜 이 경험을 넣었나요?"에서 비교할 수 있다
      expect(line?.original).toBe(target!.original);
    }
    expect(next.active).toBe("baseline");
  });

  it("문장 제외도 세 판본에 함께 반영된다", () => {
    const target = allLines(set.story).find((l) => l.basis === "related");
    expect(target).toBeDefined();
    const next = rebuildAfterEdit(set, "story", target!.id, { status: "excluded" });
    const line = allLines(next.story).find((l) => l.id === target!.id);
    expect(line?.status).toBe("excluded");
    expect(line?.text).toBe(target!.text);
  });

  it("없는 문장 id 를 주면 아무것도 바꾸지 않는다", () => {
    const next = rebuildAfterEdit(set, "story", "ln-없는아이디", { text: "바뀌면 안 됩니다" });
    expect(JSON.stringify(next.story.sections)).toBe(JSON.stringify(set.story.sections));
  });
});
