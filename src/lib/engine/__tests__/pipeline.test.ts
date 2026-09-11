/**
 * 파이프라인 통합 검증 — 실제 분석기(jd-analyze / profile-analyze)를 통과한 결과로
 * 매칭 엔진과 이력서 생성기가 함께 동작하는지 본다.
 * 공고·인물·회사는 모두 가상이다.
 */
import { describe, expect, it } from "vitest";

import { PLANNED_PREFIX } from "../resume-build";
import { runPipeline, stepAnalyzeJD, stepAnalyzeProfile, stepBaseline, stepPlan, stepStory } from "../pipeline";

const jdText = `루멘플레이 스튜디오
Senior Unity Gameplay Engineer

주요 업무
- 핵심 게임 기능을 설계하고 구현합니다.
- 게임 성능 문제를 분석하고 최적화합니다.
- 출시 품질을 책임집니다.

자격 요건
- 상용 게임 개발 경력 5년 이상
- Unity 와 C# 으로 핵심 기능을 구현한 경험
- 성능 분석과 최적화를 직접 수행한 경험

우대 사항
- 장기 라이브 운영 경험
- 주니어 멘토링 경험
`;

const profileText = `한서준
Unity / C# 개발자
seojun@example.com

경력
픽셀브릿지 | 게임 클라이언트 개발자 | 2025.09 ~ 2026.08
- 상용 게임의 퀘스트 UI 와 데이터 연동 기능을 구현했습니다
- 기획, 아트, QA 와 협업하며 코드 리뷰를 진행했습니다
- 게임 업데이트 2회에 참여했습니다

노바인더스트리 | C# 3D 소프트웨어 개발자 | 2023.09 ~ 2025.08
- 산업용 3D 뷰어의 기능 개발과 배포, 장애로그 대응을 수행했습니다
- 동일 내부 테스트 장면의 로딩 시간을 4.0초에서 3.0초로 개선했습니다

학력
한국대학교 | 컴퓨터공학 학사 | 2019.03 ~ 2023.02

기술
Unity, C#, 3D, 성능 최적화
`;

const result = runPipeline({ jdText, profileText });

describe("runPipeline — 전체 실행", () => {
  it("공고와 이력을 읽어 분석서와 세 판본을 만든다", () => {
    expect(result.posting.requirements.length).toBeGreaterThan(0);
    expect(result.profile.experiences.length).toBeGreaterThan(0);
    expect(result.report.dimensions.reduce((a, d) => a + d.weight, 0)).toBe(100);
    expect(result.resumes.baseline.variant).toBe("baseline");
    expect(result.resumes.story.variant).toBe("story");
    expect(result.resumes.future.variant).toBe("future");
    expect(result.resumes.submitVariant).toBe("story");
  });

  it("전체 매칭률이 현재 ≤ 스토리 후 ≤ 목표 순서를 지킨다", () => {
    const d = result.report.overall.display;
    expect(d.current).toBeLessThanOrEqual(d.afterStory);
    expect(d.afterStory).toBeLessThanOrEqual(d.target);
  });

  it("경력 연수 조건은 목표에서도 오르지 않고 별도 확인 안내가 붙는다", () => {
    const tenure = result.report.dimensions.find((x) => x.targetCaveat);
    expect(tenure).toBeDefined();
    expect(tenure?.target).toBe(tenure?.afterStory);
    expect(result.report.verdictNote).toContain("별도 확인");
  });

  it("다른 영역(비게임)의 경험은 관련 경험으로만 쓰이고 연수에는 합산되지 않는다", () => {
    const tenure = result.report.dimensions.find((x) => x.targetCaveat);
    // 요구 5년(60개월) 대비 게임 영역 재직 12개월 → 20% 유지
    expect(tenure?.current).toBe(20);
    expect(tenure?.storyBasis).toContain("합산하지 않고");
  });

  it("제출 가능한 두 판본에는 예정 문장이 없고 미래 판본에만 있다", () => {
    const lines = (v: "baseline" | "story" | "future") =>
      result.resumes[v].sections.flatMap((s) => [...s.lines, ...s.entries.flatMap((e) => e.lines)]);
    expect(lines("baseline").some((l) => l.basis === "planned")).toBe(false);
    expect(lines("story").some((l) => l.basis === "planned")).toBe(false);
    const planned = lines("future").filter((l) => l.basis === "planned");
    expect(planned.length).toBeGreaterThan(0);
    expect(planned.every((l) => l.text.startsWith(PLANNED_PREFIX))).toBe(true);
  });

  it("추가 질문은 근거가 부족한 부문에 대해 3~5개가 나온다", () => {
    expect(result.questions.length).toBeGreaterThanOrEqual(3);
    expect(result.questions.length).toBeLessThanOrEqual(5);
  });

  it("같은 입력이면 같은 결과를 낸다 (결정적)", () => {
    const again = runPipeline({ jdText, profileText });
    expect(JSON.stringify(again)).toBe(JSON.stringify(result));
  });
});

describe("단계 함수 — 화면이 그대로 호출한다", () => {
  const posting = stepAnalyzeJD(jdText, { sourceType: "paste" });
  const profile = stepAnalyzeProfile(profileText, { name: "한서준" });

  it("stepBaseline 은 현재 매칭과 이력서 1 을 만든다", () => {
    const baseline = stepBaseline(posting, profile);
    expect(baseline.resume.variant).toBe("baseline");
    expect(baseline.overall).toEqual(baseline.report.overall);
    expect(baseline.resume.narrative.matchScore).toBe(baseline.report.overall.display.current);
  });

  it("stepStory 는 앞 단계의 분석서를 받아 이력서 2 를 만든다", () => {
    const baseline = stepBaseline(posting, profile);
    const story = stepStory(posting, profile, baseline.report);
    expect(story.resume.variant).toBe("story");
    expect(story.stories).toBe(baseline.report.stories);
    expect(story.resume.narrative.matchScore).toBe(baseline.report.overall.display.afterStory);
  });

  it("stepPlan 은 실행 과제와 제출 불가 판본을 만든다", () => {
    const baseline = stepBaseline(posting, profile);
    const plan = stepPlan(posting, profile, baseline.report);
    expect(plan.resume.variant).toBe("future");
    expect(plan.actions).toBe(baseline.report.actions);
    expect(plan.resume.narrative.matchScore).toBe(baseline.report.overall.display.target);
    expect(plan.resume.narrative.caution).toContain("제출할 수 없습니다");
    // 체크만으로 점수를 주지 않는다 — 시작 상태는 모두 todo
    expect(plan.actions.every((a) => a.status === "todo")).toBe(true);
  });

  it("출처(붙여넣기·URL)는 분석 결과에 그대로 남는다", () => {
    const fromUrl = stepAnalyzeJD(jdText, { sourceType: "url", sourceUrl: "https://example.com/jobs/1" });
    expect(fromUrl.sourceType).toBe("url");
    expect(fromUrl.sourceUrl).toBe("https://example.com/jobs/1");
  });
});
