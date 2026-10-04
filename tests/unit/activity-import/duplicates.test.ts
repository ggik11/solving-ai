import { describe, expect, it } from "vitest";
import { findDuplicateCandidates } from "@/lib/activity-import/duplicates";

const existing = [
  { id: "1", title: "2026 아이디어 공모전", orgName: "가상기관", sourceUrl: "https://notice.example.org/events/idea-2026" },
  { id: "2", title: "전혀 다른 활동", orgName: "다른기관", sourceUrl: "https://other.example.org/x" },
  { id: "3", title: "2026 아이디어 공모전", orgName: null, sourceUrl: null },
];

describe("findDuplicateCandidates", () => {
  it("동일한 dedupe 키(URL)를 가진 활동을 찾는다", () => {
    const result = findDuplicateCandidates(
      { dedupeKey: "notice.example.org/events/idea-2026", title: "다른 제목", orgName: null },
      existing
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
    expect(result[0].matchedBy).toEqual(["url"]);
  });

  it("제목이 (공백/대소문자 무시하고) 같으면 찾는다", () => {
    const result = findDuplicateCandidates(
      { dedupeKey: null, title: "2026  아이디어   공모전", orgName: null },
      existing
    );
    const ids = result.map((r) => r.id).sort();
    expect(ids).toEqual(["1", "3"]);
  });

  it("제목과 주최기관이 모두 같으면 'org'도 함께 표시한다", () => {
    const result = findDuplicateCandidates(
      { dedupeKey: null, title: "2026 아이디어 공모전", orgName: "가상기관" },
      existing
    );
    const match = result.find((r) => r.id === "1");
    expect(match?.matchedBy).toEqual(expect.arrayContaining(["title", "org"]));
  });

  it("아무것도 겹치지 않으면 빈 배열을 반환한다", () => {
    const result = findDuplicateCandidates({ dedupeKey: "nope.example.com/x", title: "완전히 새로운 활동", orgName: null }, existing);
    expect(result).toEqual([]);
  });

  it("주최기관만 같고 제목이 다르면 중복으로 보지 않는다(신호가 약함)", () => {
    const result = findDuplicateCandidates({ dedupeKey: null, title: "완전히 다른 제목", orgName: "가상기관" }, existing);
    expect(result).toEqual([]);
  });
});
