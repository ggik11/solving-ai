import { describe, expect, it } from "vitest";
import { validateRecruitDeadline } from "@/lib/party";

const NOW = new Date("2026-06-15T12:00:00.000Z");

describe("validateRecruitDeadline", () => {
  it("빈 값/공백은 유효하다(선택 항목)", () => {
    expect(validateRecruitDeadline("", NOW)).toBeNull();
    expect(validateRecruitDeadline("   ", NOW)).toBeNull();
    expect(validateRecruitDeadline(null, NOW)).toBeNull();
    expect(validateRecruitDeadline(undefined, NOW)).toBeNull();
  });

  it("해석할 수 없는 날짜 문자열은 INVALID다", () => {
    expect(validateRecruitDeadline("NaN-NaN-NaNTNaN:NaN", NOW)).toBe("INVALID");
    expect(validateRecruitDeadline("이건 날짜가 아님", NOW)).toBe("INVALID");
  });

  it("합리적인 범위 안의 미래 날짜는 유효하다", () => {
    expect(validateRecruitDeadline("2026-07-01T10:00", NOW)).toBeNull();
    expect(validateRecruitDeadline("2026-06-15T18:00:00.000Z", NOW)).toBeNull(); // 당일, 몇 시간 뒤
  });

  it("1일보다 많이 지난 과거는 TOO_FAR_PAST다", () => {
    expect(validateRecruitDeadline("2026-06-10T00:00:00.000Z", NOW)).toBe("TOO_FAR_PAST");
  });

  it("18개월(548일)보다 먼 미래는 TOO_FAR_FUTURE다", () => {
    expect(validateRecruitDeadline("2029-01-01T00:00:00.000Z", NOW)).toBe("TOO_FAR_FUTURE");
  });

  it("ISO 문자열(서버가 받는 형식)도 동일하게 검사한다", () => {
    expect(validateRecruitDeadline("2026-07-01T10:00:00.000Z", NOW)).toBeNull();
    expect(validateRecruitDeadline("not-an-iso-string", NOW)).toBe("INVALID");
  });
});
