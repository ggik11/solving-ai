import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractDateCandidates, extractStructuredData, pickBestDates } from "@/lib/activity-import/extract";
import { htmlToText } from "@/lib/activity-import/html-text";

function fixture(name: string): string {
  return readFileSync(path.resolve(__dirname, "../fixtures/activity-import", name), "utf-8");
}

describe("extractStructuredData", () => {
  it("JSON-LD/meta/title/canonical을 추출한다", () => {
    const html = fixture("notice-basic.html");
    const data = extractStructuredData(html);
    expect(data.titleTag).toBe("2026 대학생 아이디어 공모전 - 가상기관");
    expect(data.ogTitle).toBe("2026 대학생 아이디어 공모전");
    expect(data.metaDescription).toBe("대학생을 대상으로 한 아이디어 공모전입니다.");
    expect(data.canonicalUrl).toBe("https://notice.example.org/events/idea-2026");
    expect(data.jsonLd).toHaveLength(1);
    expect(data.jsonLd[0]).toMatchObject({ name: "2026 대학생 아이디어 공모전" });
  });

  it("JSON-LD가 없거나 깨져도 예외 없이 빈 배열을 반환한다", () => {
    const html = `<html><head><script type="application/ld+json">{ not json }</script></head><body></body></html>`;
    const data = extractStructuredData(html);
    expect(data.jsonLd).toEqual([]);
  });

  it("구조화 데이터가 전혀 없는 페이지도 안전하게 처리한다", () => {
    const html = `<html><head><title>제목만 있음</title></head><body><p>본문</p></body></html>`;
    const data = extractStructuredData(html);
    expect(data.titleTag).toBe("제목만 있음");
    expect(data.ogTitle).toBeNull();
    expect(data.metaDescription).toBeNull();
    expect(data.canonicalUrl).toBeNull();
  });
});

describe("extractDateCandidates — 다양한 한국어 날짜 형식", () => {
  const now = new Date("2026-10-04T00:00:00+09:00");

  it("YYYY.MM.DD. 형식과 시각을 함께 인식한다", () => {
    const text = htmlToText(fixture("notice-basic.html"));
    const candidates = extractDateCandidates(text, now);
    const end = candidates.find((c) => c.raw.includes("2026.10.31"));
    expect(end).toBeDefined();
    expect(end?.hasTime).toBe(true);
    expect(end?.iso).toBe(new Date("2026-10-31T18:00:00+09:00").toISOString());
    expect(end?.role).toBe("apply_end");
  });

  it("YYYY년 MM월 DD일(요일), MM월 DD일(요일), ~MM/DD 형식을 모두 인식한다", () => {
    const text = htmlToText(fixture("notice-korean-dates.html"));
    const candidates = extractDateCandidates(text, now);

    const start = candidates.find((c) => c.raw.includes("2026년 9월 15일"));
    expect(start).toBeDefined();
    expect(start?.yearInferred).toBe(false);
    expect(start?.role).toBe("apply_start");
    expect(start?.iso).toBe(new Date("2026-09-15T00:00:00+09:00").toISOString());

    const end = candidates.find((c) => c.raw.startsWith("10월 31일"));
    expect(end).toBeDefined();
    expect(end?.yearInferred).toBe(true); // 연도가 본문에 없어 추정됨
    expect(end?.role).toBe("apply_end");
    expect(end?.hasTime).toBe(true);

    const tilde = candidates.find((c) => c.raw.includes("~") && c.raw.includes("10/31"));
    expect(tilde).toBeDefined();
    expect(tilde?.role).toBe("apply_end");
  });

  it("YYYY-MM-DD 범위(활동 기간)도 인식한다", () => {
    const text = htmlToText(fixture("notice-korean-dates.html"));
    const candidates = extractDateCandidates(text, now);
    const activityStart = candidates.find((c) => c.raw === "2026-11-01");
    const activityEnd = candidates.find((c) => c.raw === "2027-01-31");
    expect(activityStart?.iso).toBe(new Date("2026-11-01T00:00:00+09:00").toISOString());
    expect(activityEnd?.iso).toBe(new Date("2027-01-31T00:00:00+09:00").toISOString());
  });

  it("각 후보는 원문 근거 문장(context)을 포함한다", () => {
    const text = "활동 안내: 접수 마감 2026.10.31. 18:00까지 제출.";
    const candidates = extractDateCandidates(text, now);
    expect(candidates[0].context).toContain("접수 마감");
    expect(candidates[0].context).toContain("2026.10.31");
  });

  it("연도가 이미 많이 지난 월/일은 다음 해로 추정한다(결정적 규칙)", () => {
    // now = 2026-10-04. "1월 5일"은 올해 기준 이미 9개월 넘게 지났으므로 내년(2027)으로 추정.
    const candidates = extractDateCandidates("접수 마감 1월 5일까지", now);
    const candidate = candidates[0];
    expect(candidate.yearInferred).toBe(true);
    expect(candidate.iso?.startsWith("2026")).toBe(false);
  });

  it("빈 텍스트/날짜 없는 텍스트는 빈 배열을 반환한다", () => {
    expect(extractDateCandidates("", now)).toEqual([]);
    expect(extractDateCandidates("날짜 정보가 없는 공고입니다.", now)).toEqual([]);
  });
});

describe("pickBestDates", () => {
  it("역할이 분류된 후보 중 가장 먼저 나온 것을 고른다", () => {
    const now = new Date("2026-10-04T00:00:00+09:00");
    const text = htmlToText(fixture("notice-basic.html"));
    const candidates = extractDateCandidates(text, now);
    const best = pickBestDates(candidates);
    expect(best.applyStart?.raw).toContain("2026.10.01");
    expect(best.applyEnd?.raw).toContain("2026.10.31");
    expect(best.all.length).toBeGreaterThanOrEqual(2);
  });
});
