import { describe, expect, it } from "vitest";
import { checkDateRangeIssues, verifyDateAgainstText } from "@/lib/activity-import/verify";

describe("verifyDateAgainstText", () => {
  it("원문에 있는 문자열은 검증된다", () => {
    expect(verifyDateAgainstText("2026.10.31.", "접수 마감 2026.10.31. 18:00까지")).toBe(true);
  });

  it("공백 차이는 무시하고 대조한다", () => {
    expect(verifyDateAgainstText("2026. 10. 31.", "접수 마감 2026.  10.   31.  까지")).toBe(true);
  });

  it("원문에 없는 날짜(LLM이 지어낸 값 등)는 거부한다", () => {
    expect(verifyDateAgainstText("2026.12.25.", "접수 마감 2026.10.31. 18:00까지")).toBe(false);
  });

  it("빈 문자열은 거부한다", () => {
    expect(verifyDateAgainstText("", "아무 텍스트")).toBe(false);
  });
});

describe("checkDateRangeIssues", () => {
  const now = new Date("2026-10-04T00:00:00Z");

  it("정상적인 기간은 이슈가 없다", () => {
    const issues = checkDateRangeIssues(
      { applyStartIso: "2026-10-05T00:00:00Z", applyEndIso: "2026-10-31T09:00:00Z" },
      undefined,
      now
    );
    expect(issues).toEqual([]);
  });

  it("시작일이 마감일보다 늦으면 START_AFTER_END", () => {
    const issues = checkDateRangeIssues(
      { applyStartIso: "2026-11-01T00:00:00Z", applyEndIso: "2026-10-31T00:00:00Z" },
      undefined,
      now
    );
    expect(issues).toContain("START_AFTER_END");
  });

  it("마감이 지나치게 과거면 TOO_FAR_PAST", () => {
    const issues = checkDateRangeIssues({ applyStartIso: null, applyEndIso: "2026-01-01T00:00:00Z" }, undefined, now);
    expect(issues).toContain("TOO_FAR_PAST");
  });

  it("마감이 지나치게 먼 미래면 TOO_FAR_FUTURE", () => {
    const issues = checkDateRangeIssues({ applyStartIso: null, applyEndIso: "2030-01-01T00:00:00Z" }, undefined, now);
    expect(issues).toContain("TOO_FAR_FUTURE");
  });

  it("마감 시각이 KST 자정이면 DATE_ONLY_NO_TIME", () => {
    const issues = checkDateRangeIssues(
      { applyStartIso: null, applyEndIso: "2026-10-30T15:00:00Z" }, // UTC 15:00 = KST 00:00
      undefined,
      now
    );
    expect(issues).toContain("DATE_ONLY_NO_TIME");
  });

  it("마감일이 없으면 과거/미래/정밀도 이슈를 검사하지 않는다", () => {
    const issues = checkDateRangeIssues({ applyStartIso: "2026-10-05T00:00:00Z", applyEndIso: null }, undefined, now);
    expect(issues).toEqual([]);
  });

  it("설정값을 바꾸면 그 기준으로 판정한다", () => {
    const issues = checkDateRangeIssues(
      { applyStartIso: null, applyEndIso: "2026-09-25T00:00:00Z" },
      { maxPastDays: 3, maxFutureDays: 365 },
      now
    );
    expect(issues).toContain("TOO_FAR_PAST");
  });
});
