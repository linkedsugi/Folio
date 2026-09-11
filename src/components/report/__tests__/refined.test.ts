/**
 * 표식은 "이 문장의 출처는 모델"이라고 말하는 장치다.
 * 한 자리라도 잘못 붙으면 규칙 기반 문장을 모델의 것이라 말하게 되고,
 * 빠뜨리면 모델이 쓴 문장을 앱의 계산으로 읽게 한다. 둘 다 거짓말이므로 경계를 못박아 둔다.
 */
import { describe, expect, it } from "vitest";
import { makeRefinedLookup } from "../refined";

describe("makeRefinedLookup", () => {
  it("정밀 분석을 쓰지 않았으면(undefined) 어떤 경로도 다듬어지지 않았다", () => {
    const refined = makeRefinedLookup(undefined);

    expect(refined("idealCandidate:oneLine")).toBe(false);
    expect(refined("dimension:dim-1:storyBasis")).toBe(false);
    expect(refined("candidacyNow:concerns:0:response")).toBe(false);
  });

  it("바뀐 자리가 하나도 없으면(빈 배열) 어떤 경로도 다듬어지지 않았다", () => {
    const refined = makeRefinedLookup([]);

    expect(refined("idealCandidate:oneLine")).toBe(false);
    expect(refined("")).toBe(false);
  });

  it("목록에 있는 경로와 정확히 같을 때만 참이다", () => {
    const refined = makeRefinedLookup([
      "idealCandidate:oneLine",
      "dimension:dim-1:currentBasis",
      "story:story-2:resumeSentence",
    ]);

    expect(refined("idealCandidate:oneLine")).toBe(true);
    expect(refined("dimension:dim-1:currentBasis")).toBe(true);
    expect(refined("story:story-2:resumeSentence")).toBe(true);
  });

  it("목록에 없는 경로는 거짓이다 — 같은 부문의 다른 항목도 마찬가지다", () => {
    const refined = makeRefinedLookup(["dimension:dim-1:currentBasis"]);

    expect(refined("dimension:dim-1:storyBasis")).toBe(false);
    expect(refined("dimension:dim-1:remainingGap")).toBe(false);
    expect(refined("dimension:dim-2:currentBasis")).toBe(false);
  });

  it("접두사만 같은 경로는 거짓이다 — 넓게 잡으면 출처가 거짓이 된다", () => {
    const refined = makeRefinedLookup(["dimension:dim-1:currentBasis"]);

    // 앞부분만 겹치는 짧은 경로
    expect(refined("dimension:dim-1")).toBe(false);
    expect(refined("dimension")).toBe(false);
    // 반대로 더 깊은 경로
    expect(refined("dimension:dim-1:currentBasis:0")).toBe(false);
    // id 의 앞부분만 같은 다른 부문
    expect(refined("dimension:dim-11:currentBasis")).toBe(false);
  });

  it("같은 모양의 now/future 경로를 서로 섞지 않는다", () => {
    const refined = makeRefinedLookup([
      "candidacyNow:reasonsToConsider:0",
      "candidacyFuture:concerns:1:response",
    ]);

    expect(refined("candidacyNow:reasonsToConsider:0")).toBe(true);
    expect(refined("candidacyFuture:reasonsToConsider:0")).toBe(false);

    expect(refined("candidacyFuture:concerns:1:response")).toBe(true);
    expect(refined("candidacyNow:concerns:1:response")).toBe(false);
    // 자리(index)가 다르면 다른 문장이다
    expect(refined("candidacyFuture:concerns:0:response")).toBe(false);
  });

  it("경로가 중복돼 들어와도 결과는 같다", () => {
    const refined = makeRefinedLookup([
      "story:story-1:interviewNote",
      "story:story-1:interviewNote",
    ]);

    expect(refined("story:story-1:interviewNote")).toBe(true);
    expect(refined("story:story-1:resumeSentence")).toBe(false);
  });

  it("한 번 만든 조회 함수는 몇 번을 물어도 같은 답을 준다", () => {
    const changedPaths = ["candidacyNow:conditions:2"];
    const refined = makeRefinedLookup(changedPaths);

    expect(refined("candidacyNow:conditions:2")).toBe(true);
    expect(refined("candidacyNow:conditions:2")).toBe(true);

    // 넘긴 배열을 나중에 바꿔도 이미 만든 조회 함수는 흔들리지 않는다.
    changedPaths.push("candidacyNow:conditions:3");
    expect(refined("candidacyNow:conditions:3")).toBe(false);
  });
});
