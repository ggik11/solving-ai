import { describe, expect, it } from "vitest";
import { dedupeKeyOf, normalizeImportUrl } from "@/lib/activity-import/url-normalize";

describe("normalizeImportUrl", () => {
  it("유효한 http(s) URL을 정규화해 반환한다", () => {
    const result = normalizeImportUrl("https://Example.com/notice/1?a=1#frag");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.url).toBe("https://example.com/notice/1?a=1#frag");
      expect(result.value.dedupeKey).toBe("example.com/notice/1");
    }
  });

  it("빈 문자열은 거부한다", () => {
    expect(normalizeImportUrl("").ok).toBe(false);
    expect(normalizeImportUrl("   ").ok).toBe(false);
  });

  it("올바르지 않은 URL은 거부한다", () => {
    expect(normalizeImportUrl("not a url").ok).toBe(false);
  });

  it("http(s)가 아닌 스킴은 거부한다", () => {
    expect(normalizeImportUrl("javascript:alert(1)").ok).toBe(false);
    expect(normalizeImportUrl("ftp://example.com/file").ok).toBe(false);
  });

  it("www.와 끝 슬래시 차이는 같은 dedupe 키로 묶인다", () => {
    const a = normalizeImportUrl("https://www.example.com/notice/1/");
    const b = normalizeImportUrl("https://example.com/notice/1");
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.value.dedupeKey).toBe(b.value.dedupeKey);
    }
  });
});

describe("dedupeKeyOf", () => {
  it("null/undefined/빈 값은 null을 반환한다", () => {
    expect(dedupeKeyOf(null)).toBeNull();
    expect(dedupeKeyOf(undefined)).toBeNull();
    expect(dedupeKeyOf("")).toBeNull();
  });

  it("저장된 URL에서도 동일한 키를 계산한다", () => {
    expect(dedupeKeyOf("https://www.example.com/a/b/")).toBe("example.com/a/b");
  });
});
