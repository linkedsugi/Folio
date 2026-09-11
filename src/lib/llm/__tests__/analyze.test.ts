/**
 * 정밀 분석 보강 검증.
 *
 * 여기서 지키려는 것은 하나다 — 모델이 무엇을 돌려주든 분석서가 망가지지 않는다.
 * 실제 API 는 부르지 않고, fetch 를 가짜로 세워 응답을 직접 만든다.
 * 공고·인물·회사는 모두 가상이다.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { runPipeline } from "../../engine/pipeline";
import { containsProbabilityClaim, enrichReport, MAX_TEXT_LENGTH } from "../analyze";
import { DEFAULT_MODEL_ID } from "../models";

const KEY = "sk-ant-test-키";

const jdText = `루멘플레이 스튜디오
Senior Unity Gameplay Engineer

주요 업무
- 핵심 게임 기능을 설계하고 구현합니다.
- 게임 성능 문제를 분석하고 최적화합니다.

자격 요건
- 상용 게임 개발 경력 5년 이상
- Unity 와 C# 으로 핵심 기능을 구현한 경험
- 성능 분석과 최적화를 직접 수행한 경험
`;

const profileText = `한서준
Unity / C# 개발자
seojun@example.com

경력
픽셀브릿지 | 게임 클라이언트 개발자 | 2025.09 ~ 2026.08
- 상용 게임의 퀘스트 UI 와 데이터 연동 기능을 구현했습니다
- 게임 업데이트 2회에 참여했습니다

노바인더스트리 | C# 3D 소프트웨어 개발자 | 2023.09 ~ 2025.08
- 산업용 3D 뷰어의 기능 개발과 배포를 수행했습니다
- 동일 내부 테스트 장면의 로딩 시간을 4.0초에서 3.0초로 개선했습니다

학력
한국대학교 | 컴퓨터공학 학사 | 2019.03 ~ 2023.02
`;

const base = runPipeline({ jdText, profileText });

function input(overrides: Partial<Parameters<typeof enrichReport>[0]> = {}) {
  return {
    posting: base.posting,
    profile: base.profile,
    report: base.report,
    modelId: DEFAULT_MODEL_ID,
    apiKey: KEY,
    ...overrides,
  };
}

function stubPatch(patch: unknown) {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "```json\n" + JSON.stringify(patch) + "\n```" }],
      }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function stubStatus(status: number) {
  const fetchMock = vi.fn(async () => ({
    ok: false,
    status,
    text: async () => JSON.stringify({ error: "nope" }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("보강 — 구조는 그대로, 문장만 좋아진다", () => {
  it("한 줄 정의와 부문 설명, 스토리 문장을 바꿔 준다", async () => {
    const dimension = base.report.dimensions[0];
    const story = base.report.stories[0];
    stubPatch({
      idealCandidateOneLine: "출시까지 책임지고 성능 문제를 직접 해결해 온 Unity 개발자를 찾습니다.",
      dimensions: [
        {
          id: dimension.id,
          currentBasis: "상용 게임의 퀘스트 UI 를 직접 구현한 경험이 근거입니다.",
          remainingGap: "엔진 코어 수정 경험은 아직 확인되지 않았습니다.",
        },
      ],
      stories: story
        ? [{ id: story.id, resumeSentence: "퀘스트 UI 와 데이터 연동 기능을 직접 구현했습니다." }]
        : [],
    });

    const out = await enrichReport(input());

    expect(out.usedLlm).toBe(true);
    expect(out.failure).toBeUndefined();
    expect(out.report.idealCandidate.oneLine).toContain("Unity 개발자를 찾습니다");
    expect(out.report.dimensions[0].currentBasis).toContain("퀘스트 UI");
    expect(out.report.dimensions[0].remainingGap).toContain("엔진 코어");
    // 화면이 출처를 밝힐 수 있도록 표시를 바꾼다.
    expect(out.report.generatedBy).toBe("llm");
  });

  it("모델이 점수를 바꿔 보내도 규칙 엔진 값이 유지된다", async () => {
    const dimension = base.report.dimensions[0];
    stubPatch({
      dimensions: [
        {
          id: dimension.id,
          current: 99,
          afterStory: 99,
          target: 100,
          weight: 80,
          currentBasis: "문장만 고쳐 주세요.",
        },
      ],
    });

    const out = await enrichReport(input());
    const after = out.report.dimensions[0];

    expect(after.currentBasis).toBe("문장만 고쳐 주세요.");
    expect(after.current).toBe(dimension.current);
    expect(after.afterStory).toBe(dimension.afterStory);
    expect(after.target).toBe(dimension.target);
    expect(after.weight).toBe(dimension.weight);
    expect(out.report.overall).toEqual(base.report.overall);
    expect(out.report.verdict).toBe(base.report.verdict);
  });

  it("입력 분석서를 바꾸지 않는다 — 실패해도 되돌릴 것이 없어야 한다", async () => {
    const snapshot = structuredClone(base.report);
    stubPatch({
      idealCandidateOneLine: "전혀 다른 한 줄입니다.",
      dimensions: [{ id: base.report.dimensions[0].id, currentBasis: "바뀐 근거." }],
    });

    await enrichReport(input());
    expect(base.report).toEqual(snapshot);
  });
});

describe("검증 — 입력에 없는 것은 버린다", () => {
  it("없는 부문 id 는 무시한다", async () => {
    stubPatch({
      dimensions: [
        { id: "dim-지어낸-것", currentBasis: "있지도 않은 부문입니다." },
        { id: base.report.dimensions[0].id, currentBasis: "이건 실제 부문입니다." },
      ],
    });

    const out = await enrichReport(input());
    expect(out.report.dimensions).toHaveLength(base.report.dimensions.length);
    expect(out.report.dimensions[0].currentBasis).toBe("이건 실제 부문입니다.");
    expect(JSON.stringify(out.report)).not.toContain("있지도 않은 부문입니다");
  });

  it("없는 스토리 id 는 무시한다", async () => {
    stubPatch({
      idealCandidateOneLine: "정상적인 한 줄입니다.",
      stories: [{ id: "story-지어낸-것", resumeSentence: "없는 스토리에 붙인 문장입니다." }],
    });

    const out = await enrichReport(input());
    expect(out.report.stories).toEqual(base.report.stories);
    expect(JSON.stringify(out.report)).not.toContain("없는 스토리에 붙인 문장");
  });

  it("없는 경험 id 를 근거로 든 우려는 통째로 버린다 — 근거가 거짓이면 답도 거짓이다", async () => {
    stubPatch({
      candidacyNow: {
        concerns: [
          {
            concern: "상용 게임 경력이 5년에 못 미칩니다.",
            response: "우주정거장 관제 시스템을 만든 경험이 있습니다.",
            honestLimit: "다만 게임 도메인은 아닙니다.",
            evidenceIds: ["exp-없는-경험"],
          },
        ],
      },
    });

    const out = await enrichReport(input());
    expect(out.report.candidacyNow.concerns).toEqual(base.report.candidacyNow.concerns);
    expect(JSON.stringify(out.report)).not.toContain("우주정거장");
  });

  it("실제 경험 id 를 근거로 든 우려는 받아들인다", async () => {
    const expId = base.profile.experiences[0].id;
    stubPatch({
      candidacyNow: {
        concerns: [
          {
            concern: "상용 게임 경력이 공고의 5년에 못 미칩니다.",
            response: "상용 게임의 퀘스트 UI 와 데이터 연동을 직접 구현했습니다.",
            honestLimit: "엔진 코어를 직접 수정한 경험은 아직 없습니다.",
            evidenceIds: [expId],
          },
        ],
      },
    });

    const out = await enrichReport(input());
    // 모델이 한 자리만 보냈어도 규칙 기반 우려의 개수는 그대로다.
    expect(out.report.candidacyNow.concerns).toHaveLength(base.report.candidacyNow.concerns.length);
    expect(out.report.candidacyNow.concerns[0].concern).toContain("공고의 5년");
    expect(out.report.candidacyNow.concerns[0].evidenceIds).toEqual([expId]);
    expect(out.report.candidacyNow.concerns.slice(1)).toEqual(
      base.report.candidacyNow.concerns.slice(1),
    );
    // stage 와 경고문은 앱의 말이다. 모델이 건드리지 못한다.
    expect(out.report.candidacyNow.stage).toBe("now");
    expect(out.report.candidacyNow.caution).toBe(base.report.candidacyNow.caution);
  });

  it("honestLimit 이 빈 우려는 버린다 — 없으면 설득이 아니라 변명이 된다", async () => {
    stubPatch({
      candidacyNow: {
        headline: "이 팀의 성능 과제와 맞물리는 근거가 있습니다.",
        concerns: [
          {
            concern: "상용 게임 경력이 짧습니다.",
            response: "그래도 충분히 잘할 수 있습니다.",
            honestLimit: "   ",
            evidenceIds: [],
          },
        ],
      },
    });

    const out = await enrichReport(input());
    expect(out.report.candidacyNow.headline).toContain("성능 과제");
    expect(out.report.candidacyNow.concerns).toEqual(base.report.candidacyNow.concerns);
    expect(JSON.stringify(out.report)).not.toContain("충분히 잘할 수 있습니다");
  });
});

describe("검증 — 확률로 말하는 문장은 버린다", () => {
  it("'합격 확률 72%' 같은 문장은 쓰지 않는다", async () => {
    stubPatch({
      idealCandidateOneLine: "이 공고의 합격 확률은 72% 입니다.",
      dimensions: [
        { id: base.report.dimensions[0].id, currentBasis: "서류 통과율이 높은 편입니다." },
      ],
      candidacyNow: {
        headline: "72% 확률로 검토될 것입니다.",
        reasonsToConsider: [
          "성능 개선을 직접 수행한 근거가 있습니다.",
          "이 조합이면 통과율이 올라갑니다.",
        ],
      },
    });

    const out = await enrichReport(input());

    expect(out.report.idealCandidate.oneLine).toBe(base.report.idealCandidate.oneLine);
    expect(out.report.dimensions[0].currentBasis).toBe(base.report.dimensions[0].currentBasis);
    expect(out.report.candidacyNow.headline).toBe(base.report.candidacyNow.headline);
    // 확률로 말한 자리만 원본이 남고, 나머지 자리는 모델 문장이 들어간다. 개수는 그대로다.
    expect(out.report.candidacyNow.reasonsToConsider).toEqual([
      "성능 개선을 직접 수행한 근거가 있습니다.",
      ...base.report.candidacyNow.reasonsToConsider.slice(1),
    ]);
  });

  it("확률 표현을 가려내는 규칙은 직무 매칭률 문장을 막지 않는다", () => {
    expect(containsProbabilityClaim("합격 확률 72%")).toBe(true);
    expect(containsProbabilityClaim("합격확률이 높습니다")).toBe(true);
    expect(containsProbabilityClaim("서류 통과율 기준으로는")).toBe(true);
    expect(containsProbabilityClaim("통과율이 오릅니다")).toBe(true);
    expect(containsProbabilityClaim("60% 가능성이 있습니다")).toBe(true);
    expect(containsProbabilityClaim("직무 매칭률은 62% 입니다")).toBe(false);
    expect(containsProbabilityClaim("성능 개선을 직접 수행했습니다")).toBe(false);
  });
});

describe("검증 — 쓸 수 없는 문장은 원래 값을 지킨다", () => {
  it("500자를 넘으면 버린다", async () => {
    stubPatch({
      dimensions: [
        { id: base.report.dimensions[0].id, currentBasis: "가".repeat(MAX_TEXT_LENGTH + 1) },
      ],
      stories: [],
      idealCandidateOneLine: "정상적인 한 줄 정의입니다.",
    });

    const out = await enrichReport(input());
    expect(out.report.dimensions[0].currentBasis).toBe(base.report.dimensions[0].currentBasis);
    expect(out.report.idealCandidate.oneLine).toBe("정상적인 한 줄 정의입니다.");
  });

  it("빈 문장·공백은 버린다", async () => {
    stubPatch({
      idealCandidateOneLine: "   ",
      dimensions: [{ id: base.report.dimensions[0].id, currentBasis: "", storyBasis: "정상 문장." }],
    });

    const out = await enrichReport(input());
    expect(out.report.idealCandidate.oneLine).toBe(base.report.idealCandidate.oneLine);
    expect(out.report.dimensions[0].currentBasis).toBe(base.report.dimensions[0].currentBasis);
    expect(out.report.dimensions[0].storyBasis).toBe("정상 문장.");
  });
});

describe("실패 — 조용히 규칙 기반으로 돌아간다", () => {
  it("한도에 걸리면 입력 분석서를 그대로 돌려준다", async () => {
    stubStatus(429);
    const out = await enrichReport(input());

    expect(out.usedLlm).toBe(false);
    expect(out.failure).toBe("rate-limited");
    expect(out.report).toBe(base.report);
  });

  it("목록에 없는 모델이면 부르지도 않는다", async () => {
    const fetchMock = stubPatch({ idealCandidateOneLine: "쓰이지 않을 문장." });
    const out = await enrichReport(input({ modelId: "claude-opus-5.1" }));

    expect(out.usedLlm).toBe(false);
    expect(out.failure).toBe("bad-model");
    expect(out.report).toBe(base.report);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("쓸 수 있는 내용이 하나도 없으면 'bad-response' 로 남긴다", async () => {
    stubPatch({});
    const out = await enrichReport(input());

    expect(out.usedLlm).toBe(false);
    expect(out.failure).toBe("bad-response");
    expect(out.report).toBe(base.report);
  });

  it("모든 항목이 검증에서 버려져도 분석서는 온전하다", async () => {
    stubPatch({
      idealCandidateOneLine: "합격 확률이 높습니다.",
      dimensions: [{ id: "없는-부문", currentBasis: "무시됩니다." }],
    });

    const out = await enrichReport(input());
    expect(out.usedLlm).toBe(false);
    expect(out.failure).toBe("bad-response");
    expect(out.report).toEqual(base.report);
  });
});

describe("프롬프트 — 원칙은 보내고, 필요 없는 개인정보는 보내지 않는다", () => {
  it("시스템 프롬프트가 지어내지 말 것과 JSON 하나만 낼 것을 말한다", async () => {
    const fetchMock = stubPatch({ idealCandidateOneLine: "정상 한 줄." });
    await enrichReport(input());

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const system = JSON.parse(init.body as string).system as string;

    expect(system).toContain("입력에 없는 사실을 만들지 마라");
    expect(system).toContain("needs-confirmation");
    expect(system).toContain("합격확률이 아니라 직무 매칭률");
    expect(system).toContain("학위·수료를 실무 경력으로 바꾸지 마라");
    expect(system).toContain("나이·성별·외모·종교·가족관계");
    expect(system).toContain("JSON 하나만 출력하라");
    // 점수를 모델에 맡기지 않는다는 사실도 프롬프트에 적는다.
    expect(system).toContain("점수");
  });

  it("연락처는 보내지 않는다 — 문장을 다듬는 데 필요하지 않다", async () => {
    const fetchMock = stubPatch({ idealCandidateOneLine: "정상 한 줄." });
    await enrichReport(input());

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const user = JSON.parse(init.body as string).user as string | undefined;
    const message = JSON.parse(init.body as string).messages[0].content as string;

    expect(user).toBeUndefined();
    expect(message).not.toContain("seojun@example.com");
    // 대신 판단에 필요한 것은 들어 있다.
    expect(message).toContain(base.report.dimensions[0].id);
    expect(message).toContain(base.profile.experiences[0].id);
  });
});

describe("목록 — 자리만 바뀌고 개수는 줄지 않는다", () => {
  const expId = base.profile.experiences[0].id;

  it("모델이 우려를 1개만 보내도 규칙 기반 우려는 하나도 사라지지 않는다", async () => {
    // 규칙 엔진이 찾아낸 우려가 모델 응답의 길이에 따라 사라지면, 그건 문장을 다듬은 게 아니라
    // 다른 분석서를 만든 것이다.
    expect(base.report.candidacyNow.concerns.length).toBeGreaterThan(1);
    stubPatch({
      candidacyNow: {
        concerns: [
          {
            concern: "상용 게임 경력이 공고의 5년에 못 미칩니다.",
            response: "상용 게임의 퀘스트 UI 와 데이터 연동을 직접 구현했습니다.",
            honestLimit: "엔진 코어를 직접 수정한 경험은 아직 없습니다.",
            evidenceIds: [expId],
          },
        ],
      },
    });

    const out = await enrichReport(input());
    const concerns = out.report.candidacyNow.concerns;

    expect(concerns).toHaveLength(base.report.candidacyNow.concerns.length);
    expect(concerns[0].concern).toContain("공고의 5년");
    expect(concerns.slice(1)).toEqual(base.report.candidacyNow.concerns.slice(1));
  });

  it("검증에 걸린 자리는 원본이 남고, 통과한 자리만 바뀐다", async () => {
    stubPatch({
      candidacyNow: {
        concerns: [
          {
            concern: "상용 게임 경력이 공고의 5년에 못 미칩니다.",
            response: "상용 게임의 퀘스트 UI 와 데이터 연동을 직접 구현했습니다.",
            honestLimit: "엔진 코어를 직접 수정한 경험은 아직 없습니다.",
            evidenceIds: [expId],
          },
          {
            concern: "성능 최적화 경험이 게임 환경이 아닙니다.",
            response: "그래도 절차는 같습니다.",
            // 한계를 빼먹었다 — 이 자리는 통째로 버려야 한다.
            honestLimit: "",
            evidenceIds: [expId],
          },
        ],
      },
    });

    const out = await enrichReport(input());
    const concerns = out.report.candidacyNow.concerns;

    expect(concerns).toHaveLength(base.report.candidacyNow.concerns.length);
    expect(concerns[0].concern).toContain("공고의 5년");
    expect(concerns[1]).toEqual(base.report.candidacyNow.concerns[1]);
    expect(JSON.stringify(out.report)).not.toContain("그래도 절차는 같습니다");
  });

  it("근거를 하나도 대지 않은 우려는 그 자리를 원본으로 둔다", async () => {
    const withEmptyList = {
      concern: "상용 게임 경력이 공고의 5년에 못 미칩니다.",
      response: "근거 없이 답만 적었습니다.",
      honestLimit: "한계도 적었지만 근거가 없습니다.",
      evidenceIds: [],
    };

    stubPatch({ candidacyNow: { concerns: [withEmptyList] } });
    const emptyList = await enrichReport(input());
    expect(emptyList.report.candidacyNow.concerns).toEqual(base.report.candidacyNow.concerns);

    // evidenceIds 자체가 없는 경우도 같다. 확인할 길이 없는 답은 쓰지 않는다.
    const withoutField = { ...withEmptyList, evidenceIds: undefined };
    stubPatch({ candidacyNow: { concerns: [withoutField] } });
    const missingField = await enrichReport(input());
    expect(missingField.report.candidacyNow.concerns).toEqual(base.report.candidacyNow.concerns);
    expect(JSON.stringify(missingField.report)).not.toContain("근거 없이 답만 적었습니다");
  });

  it("검토할 이유와 지원 조건도 개수가 줄지 않는다", async () => {
    stubPatch({
      candidacyNow: {
        reasonsToConsider: ["상용 게임의 퀘스트 UI 를 직접 구현한 근거가 있습니다."],
        conditions: ["동등 경험 인정 범위를 먼저 확인하면 판단이 빨라집니다."],
      },
    });

    const out = await enrichReport(input());
    const now = out.report.candidacyNow;

    expect(now.reasonsToConsider).toHaveLength(base.report.candidacyNow.reasonsToConsider.length);
    expect(now.conditions).toHaveLength(base.report.candidacyNow.conditions.length);
    expect(now.reasonsToConsider[0]).toContain("퀘스트 UI");
    expect(now.reasonsToConsider.slice(1)).toEqual(
      base.report.candidacyNow.reasonsToConsider.slice(1),
    );
    expect(now.conditions.slice(1)).toEqual(base.report.candidacyNow.conditions.slice(1));
  });
});

describe("근거 — 연결할 경험이 없는 부문에는 설명을 붙이지 않는다", () => {
  it("usedExperienceIds 가 빈 부문은 현재 근거·연결 경험을 바꾸지 않는다", async () => {
    // 근거로 쓸 경험이 없는데 그럴듯한 설명만 붙으면 없는 사실을 주장하게 된다.
    const report = structuredClone(base.report);
    report.dimensions[0].usedExperienceIds = [];
    const target = report.dimensions[0];

    stubPatch({
      dimensions: [
        {
          id: target.id,
          currentBasis: "상용 게임에서 직접 구현한 근거가 충분합니다.",
          storyBasis: "연결할 경험이 많습니다.",
          remainingGap: "요구 연수와의 차이는 문장으로 메울 수 없습니다.",
        },
      ],
    });

    const out = await enrichReport(input({ report }));
    const after = out.report.dimensions[0];

    expect(after.currentBasis).toBe(target.currentBasis);
    expect(after.storyBasis).toBe(target.storyBasis);
    // 남는 차이는 근거가 없어도 말할 수 있는 내용이라 허용한다.
    expect(after.remainingGap).toBe("요구 연수와의 차이는 문장으로 메울 수 없습니다.");
    expect(out.changedPaths).toEqual([`dimension:${target.id}:remainingGap`]);
  });
});

describe("changedPaths — 무엇이 바뀌었는지 화면이 알 수 있다", () => {
  it("실제로 바뀐 자리만 담는다", async () => {
    const dimension = base.report.dimensions[1];
    const original = base.report.candidacyNow.concerns[1];

    stubPatch({
      // 원본과 똑같은 문장은 바뀐 것이 아니다.
      idealCandidateOneLine: base.report.idealCandidate.oneLine,
      dimensions: [
        {
          id: dimension.id,
          storyBasis: "산업용 3D 뷰어의 기능 개발을 직접 수행한 경험을 연결합니다.",
          // 원본 그대로 — 경로에 남지 않아야 한다.
          remainingGap: dimension.remainingGap,
        },
      ],
      candidacyNow: {
        concerns: [
          {},
          {
            concern: original.concern,
            response: "환경이 다르다는 점을 먼저 밝히고, 측정과 판단 과정을 설명합니다.",
            honestLimit: original.honestLimit,
            evidenceIds: original.evidenceIds,
          },
        ],
      },
    });

    const out = await enrichReport(input());

    expect(out.usedLlm).toBe(true);
    expect(out.changedPaths).toEqual([
      `dimension:${dimension.id}:storyBasis`,
      "candidacyNow:concerns:1:response",
    ]);
    // 경로가 가리키는 자리만 실제로 달라졌다.
    expect(out.report.dimensions[1].storyBasis).toContain("산업용 3D 뷰어");
    expect(out.report.dimensions[1].remainingGap).toBe(dimension.remainingGap);
    expect(out.report.idealCandidate.oneLine).toBe(base.report.idealCandidate.oneLine);
    expect(out.report.candidacyNow.concerns[1].response).toContain("측정과 판단 과정");
    expect(out.report.candidacyNow.concerns[0]).toEqual(base.report.candidacyNow.concerns[0]);
  });

  it("규칙 기반으로 돌아갔으면 비어 있다", async () => {
    stubStatus(429);
    const out = await enrichReport(input());

    expect(out.usedLlm).toBe(false);
    expect(out.changedPaths).toEqual([]);
  });
});

describe("깨진 입력 — 던지지 않고 규칙 기반으로 돌아간다", () => {
  it("dimensions 가 배열이 아니어도 입력 분석서를 그대로 돌려준다", async () => {
    // 프롬프트를 만드는 단계에서 TypeError 가 나는 모양이다. 그래도 분석은 멈추면 안 된다.
    const broken = { ...base.report, dimensions: null } as unknown as typeof base.report;
    const fetchMock = stubPatch({ idealCandidateOneLine: "쓰이지 않을 문장." });

    const out = await enrichReport(input({ report: broken }));

    expect(out.report).toBe(broken);
    expect(out.usedLlm).toBe(false);
    expect(out.failure).toBe("bad-response");
    expect(out.changedPaths).toEqual([]);
    // 프롬프트도 못 만들었으니 자료가 밖으로 나가지도 않았다.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("공고의 조건 목록이 깨져 있어도 던지지 않는다", async () => {
    const brokenPosting = {
      ...base.posting,
      requirements: undefined,
    } as unknown as typeof base.posting;
    stubPatch({ idealCandidateOneLine: "쓰이지 않을 문장." });

    const out = await enrichReport(input({ posting: brokenPosting }));

    expect(out.report).toBe(base.report);
    expect(out.failure).toBe("bad-response");
  });
});
