/**
 * 합격 가능성 스토리와 "계획 → 사실" 이동에 대한 회귀 테스트.
 *
 * 여기서 지키려는 것은 표현이 아니라 규칙이다:
 *  - 확률로 말하지 않는다.
 *  - 우려에 답할 때 남는 한계를 빼지 않는다.
 *  - 체크만으로 계획 문장을 사실로 옮기지 않는다.
 */
import { describe, expect, it } from "vitest";
import { runPipeline } from "@/lib/engine/pipeline";
import { isEvidenced, markPromoted, promoteCompletedActions } from "@/lib/engine/promote";
import type { ActionCard, ResumeLine } from "@/lib/types";

const JD = `루멘플레이 스튜디오
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
`;

const PROFILE = `한서준
Unity / C# 개발자

경력
픽셀브릿지 | 게임 클라이언트 개발자 | 2025.09 ~ 2026.08
- 퀘스트 UI 와 데이터 연동 기능을 구현했습니다
- 게임 성능 분석에 보조로 참여했습니다

노바비전 | C# 3D 솔루션 개발자 | 2023.09 ~ 2025.08
- 산업용 3D 뷰어의 로딩 시간을 4.0초에서 3.0초로 개선했습니다
- 배포와 장애로그 대응을 수행했습니다

학력
컴퓨터공학 학사 | 2019.03 ~ 2023.02
`;

const result = runPipeline({ jdText: JD, profileText: PROFILE });

function allLines(doc: { sections: { lines: ResumeLine[]; entries: { lines: ResumeLine[] }[] }[] }) {
  return doc.sections.flatMap((s) => [...s.lines, ...s.entries.flatMap((e) => e.lines)]);
}

describe("합격 가능성 스토리는 숫자와 분리된 판단이다", () => {
  const now = result.report.candidacyNow;
  const future = result.report.candidacyFuture;

  it("지금과 미래, 두 벌이 만들어진다", () => {
    expect(now.stage).toBe("now");
    expect(future.stage).toBe("future");
  });

  it("확률로 말하지 않는다", () => {
    const text = JSON.stringify([now, future]);
    expect(text).not.toMatch(/합격\s*(확률|가능성)\s*\d/);
    expect(text).not.toMatch(/\d+\s*%\s*(확률|합격)/);
    expect(text).not.toMatch(/서류\s*통과율/);
  });

  it("실제 팀장의 판단을 확인한 것처럼 쓰지 않는다", () => {
    expect(now.caution).toContain("추정");
    expect(now.caution).toMatch(/모집팀의 판단을 확인한 것이 아니/);
  });

  it("검토할 이유와 지원 조건이 비지 않는다", () => {
    expect(now.reasonsToConsider.length).toBeGreaterThan(0);
    expect(now.conditions.length).toBeGreaterThan(0);
  });

  it("우려에는 답과 '남는 한계'가 함께 있다 — 빠지면 설득이 아니라 변명이 된다", () => {
    for (const c of now.concerns) {
      expect(c.concern.trim().length).toBeGreaterThan(0);
      expect(c.response.trim().length).toBeGreaterThan(0);
      expect(c.honestLimit.trim().length).toBeGreaterThan(0);
    }
  });

  it("미래 이야기는 지금 사실처럼 말하지 말라고 경고한다", () => {
    expect(future.caution).toMatch(/아직 사실이 아니/);
  });
});

describe("실행 과제는 미래 이력서 문장에서 거꾸로 설계된다", () => {
  it("모든 과제가 목표 문장과 필요한 경험을 가진다", () => {
    expect(result.report.actions.length).toBeGreaterThan(0);
    for (const a of result.report.actions) {
      expect(a.targetSentence.trim().length).toBeGreaterThan(0);
      expect(a.experienceNeeded.trim().length).toBeGreaterThan(0);
      // "더 공부하세요" 로 끝나지 않는다 — 무엇을 남겨야 하는지가 있어야 한다.
      expect(a.evidence.length).toBeGreaterThan(0);
      expect(a.reassessCriteria.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("계획 문장은 증거가 확인되어야 사실로 옮겨진다", () => {
  const action: ActionCard = {
    ...result.report.actions[0],
    targetSentence: "게임의 핵심 성능 문제를 직접 분석·개선하고 전후를 측정했습니다.",
  };

  it("아직 표시만으로는 옮기지 않는다", () => {
    const r = promoteCompletedActions(result.resumes, [{ ...action, status: "in-progress" }]);
    expect(r.promoted).toHaveLength(0);
    expect(r.skipped[0].reason).toContain("진행 중");
  });

  it("증거 설명이 비어 있으면 옮기지 않는다", () => {
    const r = promoteCompletedActions(result.resumes, [
      { ...action, status: "evidence-submitted", submittedEvidence: "   " },
    ]);
    expect(r.promoted).toHaveLength(0);
    expect(isEvidenced({ ...action, status: "evidence-submitted", submittedEvidence: " " })).toBe(
      false,
    );
  });

  it("증거가 확인되면 이력서 1·2 에 사실 문장으로 들어간다", () => {
    const done: ActionCard = {
      ...action,
      status: "evidence-submitted",
      submittedEvidence: "동일 조건 전후 측정치와 본인 커밋 기록",
    };
    const r = promoteCompletedActions(result.resumes, [done]);
    expect(r.promoted).toHaveLength(1);

    const text = r.promoted[0].text;
    const inStory = allLines(r.resumes.story).find((l) => l.text === text);
    const inBaseline = allLines(r.resumes.baseline).find((l) => l.text === text);

    expect(inStory).toBeDefined();
    expect(inStory?.basis).toBe("direct"); // 이제 사실이므로 direct
    expect(inBaseline).toBeDefined();
    // 옮겨진 문장에는 [예정] 이 남지 않는다.
    expect(text.startsWith("[예정]")).toBe(false);
  });

  it("한 번 옮긴 과제는 다시 옮기지 않는다", () => {
    const done: ActionCard = {
      ...action,
      status: "evidence-submitted",
      submittedEvidence: "증거",
    };
    const first = promoteCompletedActions(result.resumes, [done]);
    const marked = markPromoted([done], first.promoted);
    expect(marked[0].promotedLineId).toBeTruthy();

    const second = promoteCompletedActions(first.resumes, marked);
    expect(second.promoted).toHaveLength(0);
  });
});

describe("스토리텔링에서 값이 왜 움직였는지 남긴다", () => {
  it("모든 부문에 storyLift 가 있다", () => {
    for (const d of result.report.dimensions) {
      expect(["lifted", "already-reflected", "no-related-experience"]).toContain(d.storyLift);
    }
  });

  it("값이 오른 부문은 lifted, 오르지 않았는데 근거도 없으면 no-related-experience", () => {
    for (const d of result.report.dimensions) {
      if (d.afterStory > d.current) expect(d.storyLift).toBe("lifted");
      if (d.usedExperienceIds.length === 0 && d.afterStory === d.current) {
        expect(d.storyLift).toBe("no-related-experience");
      }
    }
  });
});
