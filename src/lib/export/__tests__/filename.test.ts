/**
 * 파일명 회귀 테스트.
 *
 * 파일명은 사용자가 여러 회사의 여러 판본을 구분하는 유일한 단서다.
 * 그래서 두 가지를 못 박는다: **같은 입력이면 같은 이름**, 그리고 **저장이 실패하지 않는 이름**.
 */
import { describe, expect, it } from "vitest";
import type { Application, ApplicantProfile, JobPosting } from "@/lib/types";
import {
  FILENAME_MAX,
  REPORT_FILE_LABEL,
  reportFileName,
  resumeFileName,
  sanitizeFileNamePart,
} from "../filename";

const STAMP = "2026-09";

function posting(company: string): JobPosting {
  return {
    id: "jd-1",
    sourceType: "paste",
    body: "",
    company,
    roleTitle: "Unity 클라이언트 개발자",
    responsibilities: [],
    requirements: [],
    idealCandidate: {
      oneLine: "",
      coreTasks: [],
      responsibilityLevel: "independent",
      responsibilityNote: "",
      rationale: [],
    },
    reviewFlags: [],
    confirmedByUser: true,
  };
}

function profile(name: string): ApplicantProfile {
  return {
    id: "profile-1",
    name,
    headline: "",
    contact: {},
    links: [],
    experiences: [],
    reviewFlags: [],
    confirmedByUser: true,
  };
}

function application(over: Partial<Application> = {}): Application {
  return {
    id: "app-1",
    name: "루멘플레이 지원",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    stage: "export",
    completedStages: [],
    posting: posting("루멘플레이"),
    profile: profile("한서준"),
    questions: [],
    report: null,
    resumes: null,
    preflight: [],
    ...over,
  };
}

describe("resumeFileName — 회사별 버전을 이름으로 구분한다", () => {
  it("기획서의 예시 형태 그대로 만든다", () => {
    expect(resumeFileName(application(), "story", "docx", STAMP)).toBe(
      "RoleFit_이력서2_제출용_루멘플레이_한서준_2026-09.docx",
    );
  });

  it("판본 이름은 RESUME_VARIANT_META 를 따른다", () => {
    const app = application();
    expect(resumeFileName(app, "baseline", "txt", STAMP)).toBe(
      "RoleFit_이력서1_Baseline_루멘플레이_한서준_2026-09.txt",
    );
    // 이력서 3 도 파일로 받을 수 있다. 대신 이름에서 '미래(계획)'임이 보여야 한다.
    expect(resumeFileName(app, "future", "docx", STAMP)).toContain("이력서3_미래(계획)");
  });

  it("같은 입력이면 언제 불러도 같은 이름이 나온다", () => {
    const app = application();
    const a = resumeFileName(app, "story", "docx", STAMP);
    const b = resumeFileName(application(), "story", "docx", STAMP);
    expect(a).toBe(b);
  });

  it("stamp 가 다르면 이름도 다르다 — 같은 회사의 다른 시점 판본이 덮어써지지 않는다", () => {
    const app = application();
    expect(resumeFileName(app, "story", "docx", "2026-10")).not.toBe(
      resumeFileName(app, "story", "docx", STAMP),
    );
  });

  it("확장자는 점을 붙여 보내도 하나만 남는다", () => {
    const app = application();
    expect(resumeFileName(app, "story", ".DOCX", STAMP)).toBe(
      resumeFileName(app, "story", "docx", STAMP),
    );
  });
});

describe("파일명에 쓸 수 없는 문자", () => {
  it("금지 문자(/ \\ : * ? \" < > |)를 제거한다", () => {
    const app = application({ posting: posting('루/멘\\플:레*이?"<>|') });
    const name = resumeFileName(app, "story", "docx", STAMP);
    expect(name).toContain("루멘플레이");
    for (const ch of ['/', "\\", ":", "*", "?", '"', "<", ">", "|"]) {
      expect(name).not.toContain(ch);
    }
  });

  it("제어문자를 제거한다", () => {
    const app = application({ posting: posting("루멘\u0001\u0007플레이") });
    const name = resumeFileName(app, "story", "docx", STAMP);
    expect(name).toContain("루멘플레이");
    expect(name).not.toMatch(/[\u0000-\u001f\u007f]/);
  });

  it("공백은 _ 로 바꾸고 연달아 붙지 않게 한다", () => {
    expect(sanitizeFileNamePart("  루멘 플레이   스튜디오 ")).toBe("루멘_플레이_스튜디오");
  });

  it("가운뎃점은 구분자가 되고, 날짜의 하이픈은 남는다", () => {
    expect(sanitizeFileNamePart("이력서 2 · 제출용")).toBe("이력서2_제출용");
    expect(sanitizeFileNamePart("2026-09")).toBe("2026-09");
  });
});

describe("길이 상한", () => {
  const longApp = application({
    posting: posting("아주아주긴이름을가진게임회사주식회사".repeat(12)),
    profile: profile("한서준".repeat(20)),
  });

  it("확장자를 포함해 120자를 넘지 않는다", () => {
    const name = resumeFileName(longApp, "story", "docx", STAMP);
    expect(Array.from(name).length).toBeLessThanOrEqual(FILENAME_MAX);
  });

  it("길이를 줄여도 판본 이름·시각·확장자는 남는다", () => {
    const name = resumeFileName(longApp, "story", "docx", STAMP);
    expect(name.startsWith("RoleFit_이력서2_제출용_")).toBe(true);
    expect(name.endsWith("_2026-09.docx")).toBe(true);
  });

  it("회사 이름이 길어도 지원자 이름이 통째로 사라지지 않는다", () => {
    const name = resumeFileName(longApp, "story", "docx", STAMP);
    expect(name).toContain("한서준");
  });
});

describe("빠진 정보", () => {
  it("공고가 아직 없으면 지원 건 이름을 쓴다", () => {
    const app = application({ posting: null });
    expect(resumeFileName(app, "story", "docx", STAMP)).toContain("루멘플레이_지원");
  });

  it("이력이 아직 없으면 그 자리만 빠지고 구분자가 겹치지 않는다", () => {
    const app = application({ profile: null });
    const name = resumeFileName(app, "story", "docx", STAMP);
    expect(name).toBe("RoleFit_이력서2_제출용_루멘플레이_2026-09.docx");
    expect(name).not.toContain("__");
  });
});

describe("reportFileName — 이력서와 섞이지 않는다", () => {
  it("'지원전략분석서'를 쓴다", () => {
    expect(reportFileName(application(), "docx", STAMP)).toBe(
      `RoleFit_${REPORT_FILE_LABEL}_루멘플레이_한서준_2026-09.docx`,
    );
  });

  it("이력서 파일명과 절대 같아지지 않는다", () => {
    const app = application();
    expect(reportFileName(app, "docx", STAMP)).not.toBe(
      resumeFileName(app, "story", "docx", STAMP),
    );
    expect(reportFileName(app, "docx", STAMP)).not.toContain("이력서");
  });
});
