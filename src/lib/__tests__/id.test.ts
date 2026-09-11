import { describe, expect, it } from "vitest";
import { slugify } from "@/lib/id";
describe("slugify", () => {
  it("영문·숫자를 지우지 않는다", () => {
    expect(slugify("RoleFit 이력서2 루멘플레이 2026-09")).toBe("RoleFit_이력서2_루멘플레이_2026-09");
  });
  it("파일명 금지 문자는 지운다", () => {
    expect(slugify("루멘플레이/스튜디오:A*B?")).toBe("루멘플레이스튜디오AB");
  });
});
