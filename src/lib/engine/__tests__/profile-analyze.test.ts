import { describe, expect, it } from "vitest";
import { analyzeProfile, detectPublicationStatus, professionalMonths, totalMonths } from "../profile-analyze";
import {
  formatPeriod,
  mergeMonthRanges,
  monthsBetween,
  normalize,
  parsePeriod,
  splitBullets,
} from "../text-utils";

/**
 * 가상의 이력 원문. (기획서 11 샘플 A 의 설정을 본떴다)
 * 재직 경력만이 아니라 인턴·학위·논문·대회·프로젝트를 함께 넣어, 종류 분류와
 * "학력을 실무 연수로 바꾸지 않는다"는 규칙을 같이 확인한다.
 */
const PROFILE_KO = `한서준 · Unity / C# 개발자
이메일: hanseojun@example.com
연락처: 010-1234-5678
링크: https://github.com/hanseojun

경력
루멘플레이 스튜디오 · 게임 클라이언트 개발자 | 2025.09 ~ 2026.08
- 퀘스트 UI와 데이터 연동 기능을 Unity와 C#으로 직접 구현했습니다
- 기획·아트·QA와 협업하여 업데이트 2회에 참여했습니다
- 본인 역할: 퀘스트 도메인 클라이언트 기능 전담

노바링크 소프트 · C# 3D 솔루션 개발자 | 2023.09 ~ 2025.08
- 산업용 3D 뷰어의 기능 개발과 배포, 장애로그 대응을 수행했습니다
- 동일 내부 테스트 장면의 로딩 시간을 4.0초에서 3.0초로 개선했습니다

인턴
데이터드리프트 · 데이터 분석 인턴 | 2023.03 ~ 2023.10
- SQL과 Python으로 대시보드 6개 수정에 참여했습니다

학력
한국대학교 컴퓨터공학 학사 | 2019.03 ~ 2023.02
- 졸업 프로젝트로 공개 데이터 대시보드를 만들었습니다

논문
Journal of Game Science · 게임플레이 텔레메트리 분석 | 2025.04
- 상태: 게재 확정
- 제1저자로 실험 설계와 분석을 담당했습니다

Korea Game Conference · 실시간 로딩 최적화 분석 | 2026.01
- 상태: 심사 중

arXiv 프리프린트 · 게임 이탈 예측 모델 | 2025.07
- 저자 3인 중 제2저자입니다

Journal of Applied AI · 강화학습 보상 설계 비교 | 2025.11
- 실험 재현 스크립트를 작성했습니다

대회
글로벌 게임잼 2024 · 팀 프로젝트 | 2024.06
- 4인 팀에서 플레이어 이동과 UI를 구현했습니다
- 동료 1명의 Git 사용을 지원했습니다

프로젝트
사내 AI 자동화 파일럿
- 반복 업무 자동화 스크립트를 만들었습니다

기술
Unity, C#, Python, SQL, Git`;

function analyze() {
  return analyzeProfile({ rawText: PROFILE_KO });
}

describe("analyzeProfile · 사람 정보", () => {
  it("이름·한 줄 소개·연락처·링크를 뽑는다", () => {
    const profile = analyze();
    expect(profile.name).toBe("한서준");
    expect(profile.headline).toBe("Unity / C# 개발자");
    expect(profile.contact.email).toBe("hanseojun@example.com");
    expect(profile.contact.phone).toBe("010-1234-5678");
    expect(profile.links).toHaveLength(1);
    expect(profile.links[0].label).toBe("GitHub");
    // URL 만으로는 내용을 가져오지 않는다 (기획서 02)
    expect(profile.links[0].status).toBe("link-only");
    expect(profile.confirmedByUser).toBe(false);
  });

  it("전달받은 이름과 링크를 우선 사용한다", () => {
    const profile = analyzeProfile({
      rawText: PROFILE_KO,
      name: "한 서준",
      links: [{ label: "포트폴리오", url: "https://example.com/portfolio" }],
    });
    expect(profile.name).toBe("한 서준");
    expect(profile.links.map((l) => l.label)).toContain("포트폴리오");
  });
});

describe("analyzeProfile · 경험 항목", () => {
  it("기간 표기가 다른 항목들을 각각 블록으로 읽는다", () => {
    const profile = analyze();
    expect(profile.experiences.length).toBe(10);

    const first = profile.experiences[0];
    expect(first.organization).toBe("루멘플레이 스튜디오");
    expect(first.title).toBe("게임 클라이언트 개발자");
    expect(first.start).toBe("2025-09");
    expect(first.end).toBe("2026-08");
    expect(first.confidence).toBe("confirmed");
    expect(formatPeriod(first)).toBe("2025.09 ~ 2026.08");
  });

  it("종류를 재직·인턴·학위·논문·대회·프로젝트로 나눈다", () => {
    const kinds = analyze().experiences.map((e) => e.kind);
    expect(kinds.slice(0, 4)).toEqual(["job", "job", "internship", "degree"]);
    expect(kinds.filter((k) => k === "publication")).toHaveLength(4);
    expect(kinds).toContain("competition");
    expect(kinds).toContain("project");
  });

  it("불릿을 과업과 성과로 나눈다 (수치·개선 표현이 있으면 성과)", () => {
    const nova = analyze().experiences[1];
    expect(nova.tasks.some((t) => t.includes("장애로그"))).toBe(true);
    expect(nova.outcomes.some((o) => o.includes("4.0초"))).toBe(true);
    expect(nova.outcomes.some((o) => o.includes("장애로그"))).toBe(false);
  });

  it("본인 역할·책임 수준·결과물·기술을 항목마다 채운다", () => {
    const first = analyze().experiences[0];
    expect(first.ownRole).toBe("퀘스트 도메인 클라이언트 기능 전담");
    expect(first.responsibilityLevel).toBe("independent"); // "직접 구현했습니다"
    expect(first.skills).toEqual(expect.arrayContaining(["Unity", "C#"]));
  });

  it("논문 상태(게재/게재 확정/심사 중/프리프린트)를 섞지 않는다", () => {
    const papers = analyze().experiences.filter((e) => e.kind === "publication");
    expect(papers.map((p) => p.publicationStatus)).toEqual([
      "accepted",
      "under-review",
      "preprint",
      undefined,
    ]);

    // 상태를 알 수 없으면 지어내지 않고 확인 필요로 남긴다
    const flag = analyze().reviewFlags.find((f) => f.message.includes("게재 확정"));
    expect(flag?.message).toContain("논문");

    expect(detectPublicationStatus("게재 확정")).toBe("accepted");
    expect(detectPublicationStatus("심사 중")).toBe("under-review");
    expect(detectPublicationStatus("arXiv preprint")).toBe("preprint");
    expect(detectPublicationStatus("2025년 게재")).toBe("published");
    expect(detectPublicationStatus("공동 저자")).toBeUndefined();
  });

  it("기간이나 역할이 불명확하면 확인 필요로 표시한다", () => {
    const profile = analyze();
    const pilot = profile.experiences.find((e) => e.organization.includes("자동화 파일럿"));
    expect(pilot?.start).toBe("");
    expect(pilot?.title).toBe("");
    expect(pilot?.confidence).toBe("needs-confirmation");
    expect(profile.reviewFlags.some((f) => f.message.includes("기간을 읽지 못했습니다"))).toBe(true);
    expect(profile.reviewFlags.some((f) => f.message.includes("직함"))).toBe(true);
  });
});

describe("경력 개월 수", () => {
  it("겹치는 기간은 한 번만 센다", () => {
    const profile = analyze();
    // 인턴 2023.03~2023.10 과 재직 2023.09~2025.08 은 두 달이 겹친다.
    // 단순 합계는 8 + 24 + 12 = 44 개월이지만, 실제로는 2023.03~2026.08 의 42 개월이다.
    expect(professionalMonths(profile)).toBe(42);
  });

  it("학위·논문·대회는 실무 연수에 넣지 않는다", () => {
    const profile = analyze();
    expect(totalMonths(profile.experiences)).toBe(90); // 2019.03 ~ 2026.08
    expect(professionalMonths(profile)).toBeLessThan(totalMonths(profile.experiences));
    expect(totalMonths(profile.experiences, ["degree"])).toBe(48);
  });

  it("진행 중인 경력은 기준 시점까지 센다", () => {
    const profile = analyzeProfile({
      rawText: `경력\n루멘플레이 스튜디오 · 개발자 | 2026.01 ~ 현재\n- 기능을 구현했습니다`,
    });
    expect(profile.experiences[0].end).toBeNull();
    expect(professionalMonths(profile, new Date("2026-06-15T00:00:00Z"))).toBe(6);
  });
});

describe("analyzeProfile · 안전장치", () => {
  it("빈 입력이어도 throw 하지 않고 안내를 남긴다", () => {
    expect(() => analyzeProfile({ rawText: "" })).not.toThrow();
    const profile = analyzeProfile({ rawText: "" });
    expect(profile.experiences).toEqual([]);
    expect(profile.reviewFlags.some((f) => f.field === "experiences")).toBe(true);
    expect(profile.reviewFlags.some((f) => f.field === "name")).toBe(true);
  });
});

describe("text-utils", () => {
  it("붙여넣기로 깨진 표기를 정리한다", () => {
    expect(normalize("ＲｏｌｅＦｉｔ\r\n① 첫째")).toBe("RoleFit\n1. 첫째");
    expect(splitBullets("• 첫째\n이어지는 줄\n- 둘째")).toEqual(["첫째 이어지는 줄", "둘째"]);
  });

  it("여러 형태의 기간을 읽는다", () => {
    expect(parsePeriod("2023.09 ~ 2025.08")).toMatchObject({ start: "2023-09", end: "2025-08" });
    expect(parsePeriod("2023년 9월부터 현재까지")).toMatchObject({ start: "2023-09", end: null, ongoing: true });
    expect(parsePeriod("Sep 2023 - Aug 2025")).toMatchObject({ start: "2023-09", end: "2025-08" });
    expect(parsePeriod("2024.06")).toMatchObject({ start: "2024-06", end: "2024-06" });
    expect(parsePeriod("2021 ~ 2023")).toMatchObject({ start: "2021-01", end: "2023-12", precision: "year" });
    expect(parsePeriod("기간 미상")).toBeNull();
  });

  it("개월 수는 양끝을 포함하고, 겹치는 구간은 합친다", () => {
    expect(monthsBetween("2023-09", "2025-08")).toBe(24);
    expect(monthsBetween("2025-08", "2023-09")).toBe(0);
    expect(
      mergeMonthRanges([
        { start: "2023-03", end: "2023-10" },
        { start: "2023-09", end: "2025-08" },
        { start: "2025-09", end: "2026-08" },
      ]),
    ).toEqual([{ start: "2023-03", end: "2026-08" }]);
  });
});
