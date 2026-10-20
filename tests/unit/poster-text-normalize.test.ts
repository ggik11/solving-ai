import { describe, expect, it } from "vitest";
import { normalizeText } from "@/lib/poster/textNormalize";

describe("normalizeText (가이드 8/12장 2차 후처리 P1)", () => {
  it("줄바꿈과 연속 공백을 하나의 공백으로 정리한다", () => {
    const { normalized } = normalizeText("IT\n\n동아리   해커톤\t모집");
    expect(normalized).toBe("it 동아리 해커톤 모집");
  });

  it("영문을 소문자화한다", () => {
    const { normalized } = normalizeText("IT Hackathon");
    expect(normalized).toBe("it hackathon");
  });

  it("앞뒤 공백을 없앤다", () => {
    const { normalized } = normalizeText("  해커톤  ");
    expect(normalized).toBe("해커톤");
  });

  it("matchKey는 공백을 전부 뺀 버전이다(예: 해 커 톤 -> 해커톤)", () => {
    const { normalized, matchKey } = normalizeText("해 커 톤");
    expect(normalized).toBe("해 커 톤");
    expect(matchKey).toBe("해커톤");
  });

  it("빈 문자열은 그대로 빈 문자열이다", () => {
    expect(normalizeText("")).toEqual({ normalized: "", matchKey: "" });
    expect(normalizeText("   ")).toEqual({ normalized: "", matchKey: "" });
  });
});
