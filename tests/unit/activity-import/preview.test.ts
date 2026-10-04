import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildPreviewFromHtml } from "@/lib/activity-import/preview";

function fixture(name: string): string {
  return readFileSync(path.resolve(__dirname, "../fixtures/activity-import", name), "utf-8");
}

const now = new Date("2026-10-04T00:00:00+09:00");

describe("buildPreviewFromHtml", () => {
  it("규칙 기반 값(JSON-LD/og/meta)을 우선 사용한다", () => {
    const data = buildPreviewFromHtml({
      normalizedUrl: "https://notice.example.org/events/idea-2026",
      finalUrl: "https://notice.example.org/events/idea-2026",
      html: fixture("notice-basic.html"),
      existing: [],
      dedupeKey: "notice.example.org/events/idea-2026",
      llmSuggestion: null,
      now,
    });
    expect(data.suggestedTitle).toBe("2026 대학생 아이디어 공모전");
    expect(data.suggestedOrgName).toBe("가상기관");
    expect(data.suggestedDescription).toBe("참신한 아이디어를 가진 대학생을 모집합니다.");
    expect(data.llmUsed).toBe(false);
    expect(data.dateCandidates.length).toBeGreaterThan(0);
    expect(data.rangeIssues).toEqual([]);
  });

  it("LLM 제안은 규칙 기반 값이 비었을 때만 보충한다(날짜는 LLM 입력을 아예 받지 않음)", () => {
    const html = `<html><head></head><body><p>아무 구조화 데이터 없는 공고</p></body></html>`;
    const data = buildPreviewFromHtml({
      normalizedUrl: "https://example.org/x",
      finalUrl: "https://example.org/x",
      html,
      existing: [],
      dedupeKey: "example.org/x",
      llmSuggestion: { title: "LLM 제목", orgName: "LLM 기관", tags: ["IT"], eligibilitySummary: "누구나" },
      now,
    });
    expect(data.suggestedTitle).toBe("LLM 제목");
    expect(data.suggestedOrgName).toBe("LLM 기관");
    expect(data.suggestedTags).toEqual(["IT"]);
    expect(data.llmUsed).toBe(true);
  });

  it("규칙 기반 값이 있으면 LLM 제안을 덮어쓰지 않는다", () => {
    const data = buildPreviewFromHtml({
      normalizedUrl: "https://notice.example.org/events/idea-2026",
      finalUrl: "https://notice.example.org/events/idea-2026",
      html: fixture("notice-basic.html"),
      existing: [],
      dedupeKey: "notice.example.org/events/idea-2026",
      llmSuggestion: { title: "LLM이 지어낸 다른 제목" },
      now,
    });
    expect(data.suggestedTitle).toBe("2026 대학생 아이디어 공모전");
  });

  it("기존 활동과 URL이 같으면 중복 후보로 표시한다", () => {
    const data = buildPreviewFromHtml({
      normalizedUrl: "https://notice.example.org/events/idea-2026",
      finalUrl: "https://notice.example.org/events/idea-2026",
      html: fixture("notice-basic.html"),
      existing: [{ id: "existing-1", title: "다른 제목", orgName: null, sourceUrl: "https://notice.example.org/events/idea-2026" }],
      dedupeKey: "notice.example.org/events/idea-2026",
      llmSuggestion: null,
      now,
    });
    expect(data.duplicates).toHaveLength(1);
    expect(data.duplicates[0].id).toBe("existing-1");
  });

  it("기간 역전 등 이슈가 있으면 rangeIssues에 포함한다", () => {
    const html = `<html><body><p>접수 시작 2026.12.31.</p><p>접수 마감 2026.01.01.</p></body></html>`;
    const data = buildPreviewFromHtml({
      normalizedUrl: "https://example.org/x",
      finalUrl: "https://example.org/x",
      html,
      existing: [],
      dedupeKey: null,
      llmSuggestion: null,
      now,
    });
    expect(data.rangeIssues).toContain("START_AFTER_END");
  });
});
