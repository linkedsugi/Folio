import { describe, expect, it } from "vitest";
import { analyzeJobPosting, detectEquivalence, splitPostings, toRequirementLabel } from "../jd-analyze";

/**
 * 픽스처는 모두 가상의 공고다. (기획서 11~12 의 샘플 설정을 본떴다)
 * 실제 사용자는 이런 형태로 공고를 붙여넣는다고 보고, 추출 결과를 고정해 둔다.
 */
const JD_KO = `[루멘플레이 스튜디오] Senior Unity Gameplay Engineer 채용
팀: 게임플레이 개발팀
근무지: 서울 강남구
고용형태: 정규직

주요업무
- 핵심 게임 기능을 설계하고 구현합니다
- 성능 문제를 분석하고 개선합니다
- 출시 전 과정의 품질을 책임집니다
- 기획·아트·QA와 협업하며 코드 리뷰를 진행합니다

자격요건
- 상용 게임 개발 5년 이상 경험
- Unity와 C# 기반 핵심 기능 구현 경험 또는 이에 준하는 개발 경험
- 성능 분석·최적화 경험

우대사항
- 라이브 서비스 장기 운영 경험
- 주니어 개발자 멘토링 경험

전형절차
- 서류 전형 후 과제와 면접을 진행합니다
- 국문 이력서를 PDF 파일로 제출해 주세요 (A4 2장 이내)`;

const JD_EN = `Job Title: Applied AI Research Fellow
Company: Asterflow Labs

What you'll do
• Design and run reproducible research experiments
• Publish peer-reviewed papers with the team

Requirements
• Ph.D. in a related field
• Track record of peer-reviewed publications or equivalent research output

Preferred
• Experience with research grants`;

const JD_NUMBERED = `데이터드리프트 채용 공고
직무: Junior Data Analyst

주요업무
1. SQL로 지표를 집계하고 대시보드를 만듭니다
2. 분석 결과를 담당 부서에 설명합니다
① 재현 가능한 분석 사례를 정리합니다

자격요건
(1) 신입 지원 가능
(2) SQL·Python 분석 경험`;

const JD_TWO_POSTINGS = `[루멘플레이 스튜디오] Senior Unity Gameplay Engineer 채용
주요업무
- 핵심 게임 기능을 구현합니다
자격요건
- 상용 게임 개발 5년 이상

[아스터플로우] AI Product Manager 모집
주요업무
- 고객 문제를 정의하고 우선순위를 정합니다
자격요건
- PM 3년 또는 동등한 제품 과제 책임 경험`;

function analyzeKo() {
  return analyzeJobPosting({ rawText: JD_KO, sourceType: "paste" });
}

describe("analyzeJobPosting · 공고 기본 정보", () => {
  it("회사·직무·팀·근무지·고용형태를 뽑는다", () => {
    const posting = analyzeKo();
    expect(posting.company).toBe("루멘플레이 스튜디오");
    expect(posting.roleTitle).toBe("Senior Unity Gameplay Engineer");
    expect(posting.team).toBe("게임플레이 개발팀");
    expect(posting.location).toBe("서울 강남구");
    expect(posting.employmentType).toBe("정규직");
    expect(posting.confirmedByUser).toBe(false);
  });

  it("주요업무를 모두 읽고 상위 3개로 인재상의 핵심 업무를 만든다", () => {
    const posting = analyzeKo();
    expect(posting.responsibilities).toHaveLength(4);
    expect(posting.responsibilities[0]).toContain("핵심 게임 기능");
    expect(posting.idealCandidate.coreTasks).toHaveLength(3);
    // 기대하는 결과는 업무마다 달라야 한다 (기획서 04)
    expect(posting.idealCandidate.coreTasks[0].expectedOutcome.length).toBeGreaterThan(5);
    expect(posting.idealCandidate.oneLine).toContain("Senior Unity Gameplay Engineer");
  });
});

describe("analyzeJobPosting · 필수와 우대", () => {
  it("필수와 우대를 구분하고 짧은 이름(label)을 만든다", () => {
    const posting = analyzeKo();
    // 공고에 적힌 조건만 센다. 업무 설명에서 읽어낸 해석은 derivation 으로 구분된다.
    const must = posting.requirements.filter((r) => r.kind === "must" && r.derivation === "stated");
    const preferred = posting.requirements.filter((r) => r.kind === "preferred");
    expect(must).toHaveLength(3);
    expect(preferred).toHaveLength(2);
    expect(must[0].label).toBe("상용 게임 개발 5년 이상");
    // 원문 인용은 그대로 남아 있어야 "왜 이렇게 해석했나요?"를 보여줄 수 있다
    expect(posting.body).toContain(must[0].sourceQuote);
    expect(preferred[0].text).toContain("라이브 서비스");
  });

  it("동등 경험 인정 신호가 없으면 반드시 'unknown' 으로 남긴다", () => {
    const posting = analyzeKo();
    const fiveYears = posting.requirements.find((r) => r.text.includes("5년 이상"));
    const equivalent = posting.requirements.find((r) => r.text.includes("이에 준하는"));
    expect(fiveYears?.equivalence).toBe("unknown");
    expect(equivalent?.equivalence).toBe("allowed");
    // 우대 조건은 충족하지 못해도 지원이 막히지 않는다
    expect(posting.requirements.find((r) => r.kind === "preferred")?.equivalence).toBe("allowed");

    // 낱개 함수로도 같은 규칙이어야 한다
    expect(detectEquivalence("상용 게임 개발 5년 이상", "must")).toBe("unknown");
    expect(detectEquivalence("PM 3년 또는 동등한 제품 과제 책임", "must")).toBe("allowed");
    expect(detectEquivalence("게임 개발 5년 (대체 불가)", "must")).toBe("not-allowed");
  });

  it("동등 경험 인정 여부를 모르는 필수 조건은 확인 필요로 안내한다", () => {
    const posting = analyzeKo();
    const flag = posting.reviewFlags.find((f) => f.message.includes("동등 경험"));
    expect(flag).toBeDefined();
    expect(flag?.resolved).toBe(false);
  });
});

describe("analyzeJobPosting · 인재상 판단", () => {
  it("책임 수준을 원문 표현에서 읽고 근거를 남긴다", () => {
    const posting = analyzeKo();
    expect(posting.idealCandidate.responsibilityLevel).toBe("lead");
    expect(posting.idealCandidate.responsibilityNote).toContain("책임집");

    const rationale = posting.idealCandidate.rationale;
    expect(rationale.length).toBeGreaterThanOrEqual(2);
    // 모든 근거 인용은 공고 본문에 실제로 있는 문장이어야 한다 (지어내지 않는다)
    for (const note of rationale) {
      for (const evidence of note.evidence) {
        expect(evidence.source).toBe("jd");
        expect(evidence.refId).toBe(posting.id);
        expect(posting.body).toContain(evidence.quote);
      }
    }
  });

  it("문서 양식·분량·언어가 적혀 있으면 그대로 담는다", () => {
    const posting = analyzeKo();
    expect(posting.documentRules?.language).toBe("ko");
    expect(posting.documentRules?.maxPages).toBe(2);
    expect(posting.documentRules?.format).toContain("PDF");
  });
});

describe("analyzeJobPosting · 다양한 입력 형태", () => {
  it("영문 공고에서도 직무·회사·필수/우대를 뽑는다", () => {
    const posting = analyzeJobPosting({ rawText: JD_EN, sourceType: "paste" });
    expect(posting.roleTitle).toBe("Applied AI Research Fellow");
    expect(posting.company).toBe("Asterflow Labs");
    expect(posting.responsibilities).toHaveLength(2);
    const must = posting.requirements.filter((r) => r.kind === "must" && r.derivation === "stated");
    expect(must).toHaveLength(2);
    expect(must[0].equivalence).toBe("unknown");
    expect(must[1].equivalence).toBe("allowed"); // "or equivalent"
    expect(posting.requirements.filter((r) => r.kind === "preferred")).toHaveLength(1);
  });

  it("숫자·원문자 불릿도 항목으로 읽고, 못 찾은 항목은 확인 필요로 남긴다", () => {
    const posting = analyzeJobPosting({ rawText: JD_NUMBERED, sourceType: "paste" });
    expect(posting.roleTitle).toBe("Junior Data Analyst");
    expect(posting.responsibilities).toHaveLength(3);
    expect(posting.responsibilities[2]).toContain("재현 가능한 분석 사례");
    expect(
      posting.requirements.filter((r) => r.kind === "must" && r.derivation === "stated"),
    ).toHaveLength(2);
    // 회사명을 찾지 못했으므로 직접 입력하라고 안내해야 한다
    expect(posting.company).toBe("");
    expect(posting.reviewFlags.some((f) => f.field === "company" && f.severity === "warn")).toBe(true);
  });

  it("읽을 수 없는 입력이면 throw 하지 않고 빈 골격과 안내를 돌려준다", () => {
    expect(() => analyzeJobPosting({ rawText: "", sourceType: "paste" })).not.toThrow();
    const posting = analyzeJobPosting({ rawText: "안녕하세요", sourceType: "url", sourceUrl: "https://example.com/jobs/1" });
    expect(posting.roleTitle).toBe("");
    expect(posting.requirements).toEqual([]);
    expect(posting.idealCandidate.coreTasks).toEqual([]);
    expect(posting.sourceUrl).toBe("https://example.com/jobs/1");
    expect(posting.reviewFlags[0].message).toContain("공고 본문");
  });
});

describe("splitPostings · 한 페이지에 여러 공고", () => {
  it("공고 두 건을 나누고, 분석할 때 선택하라고 안내한다", () => {
    const candidates = splitPostings(JD_TWO_POSTINGS);
    expect(candidates).toHaveLength(2);
    expect(candidates[0].title).toContain("Senior Unity Gameplay Engineer");
    expect(candidates[1].title).toContain("AI Product Manager");

    const posting = analyzeJobPosting({ rawText: JD_TWO_POSTINGS, sourceType: "paste" });
    expect(posting.roleTitle).toContain("Senior Unity Gameplay Engineer");
    expect(posting.reviewFlags.some((f) => f.message.includes("공고 2개"))).toBe(true);

    // 두 번째 공고를 고르면 그 공고의 조건으로 분석된다
    const second = analyzeJobPosting({ rawText: candidates[1].body, sourceType: "paste" });
    expect(second.requirements[0].equivalence).toBe("allowed"); // "또는 동등한"
  });

  it("공고가 하나면 쪼개지 않는다", () => {
    const candidates = splitPostings(JD_KO);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].body).toContain("자격요건");
  });
});

describe("toRequirementLabel", () => {
  it("문장을 표에 들어갈 짧은 이름으로 줄인다", () => {
    expect(toRequirementLabel("성능 분석·최적화 경험")).toBe("성능 분석·최적화");
    expect(toRequirementLabel("라이브 서비스 장기 운영 경험이 있으신 분")).toBe("라이브 서비스 장기 운영");
    expect(toRequirementLabel("Unity 를 사용해 본 경험").length).toBeLessThanOrEqual(25);
  });
});

describe("공고에 명시된 조건과 앱의 해석을 구분한다", () => {
  const posting = analyzeJobPosting({
    rawText: `루멘플레이 스튜디오
Senior Unity Gameplay Engineer

주요 업무
- 핵심 게임 기능을 설계하고 구현합니다.
- 출시 이후 라이브 서비스의 장애에 대응하고 패치를 배포합니다.

자격 요건
- 상용 게임 개발 경력 5년 이상
- Unity 와 C# 으로 기능을 구현한 경험
`,
    sourceType: "paste",
  });

  it("자격 요건에서 뽑은 조건은 stated 다", () => {
    const stated = posting.requirements.filter((r) => r.derivation === "stated");
    expect(stated.length).toBeGreaterThanOrEqual(2);
    for (const r of stated) {
      // 명시 조건의 근거는 공고 본문에 실제로 있어야 한다.
      expect(posting.body).toContain(r.sourceQuote.replace(/^[-•·▪\s]+/, "").trim());
    }
  });

  it("자격 요건이 덮지 못한 업무 기대는 inferred 로 남기고 이유를 붙인다", () => {
    const inferred = posting.requirements.filter((r) => r.derivation === "inferred");
    for (const r of inferred) {
      expect(r.inferenceNote).toBeTruthy();
    }
    // 해석이 명시 조건보다 많아지면 분석이 추측처럼 보인다.
    const stated = posting.requirements.filter((r) => r.derivation === "stated");
    expect(inferred.length).toBeLessThanOrEqual(stated.length);
    expect(inferred.length).toBeLessThanOrEqual(2);
  });
});
