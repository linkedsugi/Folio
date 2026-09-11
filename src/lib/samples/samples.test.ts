/**
 * 샘플 5종이 실제 엔진을 통과해 쓸 만한 결과를 내는지 본다.
 *
 * 이 테스트는 샘플을 지키는 것이 아니라 **엔진을 지킨다.**
 * 샘플은 손으로 쓴 결과가 아니라 공고 원문과 이력 원문뿐이고, 나머지는 전부 엔진이 만든다.
 * 그래서 엔진이 나빠지면 여기서 먼저 티가 난다 — 실제로 이 테스트를 만들면서
 * 한국어 합성어를 놓치던 도메인 매칭과, 근거 두께를 무시하던 점수 계산을 찾아냈다.
 */
import { describe, expect, it } from "vitest";
import { getSamples } from "@/lib/samples";
import type { ResumeDocument, ResumeLine } from "@/lib/types";

const samples = getSamples();

function allLines(doc: ResumeDocument): ResumeLine[] {
  return doc.sections.flatMap((s) => [...s.lines, ...s.entries.flatMap((e) => e.lines)]);
}

describe("샘플 5종", () => {
  it("다섯 개가 모두 만들어진다", () => {
    expect(samples).toHaveLength(5);
    expect(new Set(samples.map((s) => s.id)).size).toBe(5);
  });

  it.each(samples.map((s) => [s.id, s] as const))("%s — 공고를 읽어낸다", (_id, s) => {
    expect(s.posting.company.trim()).not.toBe("");
    expect(s.posting.roleTitle.trim()).not.toBe("");
    // 명시된 필수 조건이 최소 3개는 나와야 표가 의미를 가진다.
    const stated = s.posting.requirements.filter((r) => r.kind === "must" && r.derivation === "stated");
    expect(stated.length).toBeGreaterThanOrEqual(3);
    expect(s.posting.idealCandidate.coreTasks).toHaveLength(3);
    // 인재상 한 줄에 낱말 가운데가 끊긴 자국이 남으면 안 된다.
    expect(s.posting.idealCandidate.oneLine).not.toMatch(/[가-힣]…\s*[가-힣]/);
  });

  it.each(samples.map((s) => [s.id, s] as const))("%s — 이력을 읽어낸다", (_id, s) => {
    expect(s.profile.experiences.length).toBeGreaterThanOrEqual(6);
    // 재직 경력만이 아니라 다른 종류의 경험도 들어와야 한다. (기획서 02)
    expect(new Set(s.profile.experiences.map((e) => e.kind)).size).toBeGreaterThanOrEqual(3);
  });

  it.each(samples.map((s) => [s.id, s] as const))("%s — 매칭이 단계 순서를 지킨다", (_id, s) => {
    const { display } = s.report.overall;
    expect(display.current).toBeLessThanOrEqual(display.afterStory);
    expect(display.afterStory).toBeLessThanOrEqual(display.target);
    // 아무 근거도 못 찾아 전부 0 이면 엔진이 고장난 것이다.
    expect(display.afterStory).toBeGreaterThan(0);
    // 반대로 현재 값이 만점이면 매칭이 너무 헐거운 것이다.
    expect(display.current).toBeLessThan(100);
    expect(s.report.dimensions.reduce((a, d) => a + d.weight, 0)).toBe(100);
  });

  it.each(samples.map((s) => [s.id, s] as const))("%s — 두 결과물이 만들어진다", (_id, s) => {
    expect(s.report.actions.length).toBeGreaterThan(0);
    expect(s.report.candidacyNow.reasonsToConsider.length).toBeGreaterThan(0);
    expect(s.report.candidacyNow.conditions.length).toBeGreaterThan(0);

    const story = allLines(s.resumes.story);
    expect(story.length).toBeGreaterThanOrEqual(5);
    // 제출용 판본에 계획 문장이 섞이면 안 된다.
    expect(story.some((l) => l.basis === "planned")).toBe(false);
    expect(allLines(s.resumes.baseline).some((l) => l.basis === "planned")).toBe(false);
    // 미래 판본의 계획 문장은 전부 [예정] 으로 시작한다.
    for (const l of allLines(s.resumes.future).filter((l) => l.basis === "planned")) {
      expect(l.text.startsWith("[예정]")).toBe(true);
    }
    expect(s.resumes.submitVariant).not.toBe("future");
  });

  it("샘플 A 는 기획서 03 의 표와 같은 자리에 선다", () => {
    // 기획서의 가상 예시는 33 → 45 → 72 다. 공고·이력 원문만 주고 엔진이 읽게 했으므로
    // 똑같이 나올 이유는 없지만, 같은 상황이라면 같은 자리 근처에 있어야 한다.
    const a = samples.find((s) => s.id === "sample-a");
    expect(a).toBeDefined();
    const d = a!.report.overall.display;
    expect(d.current).toBeGreaterThanOrEqual(25);
    expect(d.current).toBeLessThanOrEqual(45);
    expect(d.target).toBeGreaterThanOrEqual(60);
    expect(d.target).toBeLessThanOrEqual(85);

    // 경력 연수 부문은 목표에 미래 개월을 더하지 않는다.
    const tenure = a!.report.dimensions.find((x) => x.targetCaveat);
    expect(tenure).toBeDefined();
    expect(tenure!.target).toBe(tenure!.afterStory);
  });
});

describe("지원 판단은 총점 하나로 결정하지 않는다", () => {
  it("샘플마다 같은 판단이 나오지 않는다", () => {
    // 한 판단으로 몰리면 그 판단은 아무것도 가르지 못한다.
    // 실제로 "필수 조건 중 하나라도 동등 인정 여부가 불확실하면" 으로 판정하던 때
    // 다섯 샘플이 전부 같은 결론이 나왔다.
    const verdicts = new Set(samples.map((s) => s.report.verdict));
    expect(verdicts.size).toBeGreaterThanOrEqual(2);
  });

  it("샘플 A 는 동등 경력 인정 여부를 확인하며 지원을 준비한다", () => {
    // 기획서 03 의 "지금의 판단" 과 같은 결론이어야 한다.
    const a = samples.find((s) => s.id === "sample-a");
    expect(a!.report.verdict).toBe("apply-while-confirming");
  });

  it("신입 공고에 지원하는 신입에게 지원 범위를 줄이라고 하지 않는다", () => {
    // 기획서 13: 낮은 점수로 불안을 자극하지 않는다.
    // 신입 공고는 조건이 비어 있는 것이 정상이므로 가장 무거운 안내를 주면 안 된다.
    const d = samples.find((s) => s.id === "sample-d");
    expect(d!.report.verdict).not.toBe("adjust-scope");
    // 신입 공고에 임의의 연수 부족 항목을 만들지도 않는다. (기획서 12 샘플 D)
    expect(d!.report.dimensions.some((x) => x.targetCaveat)).toBe(false);
  });
});
