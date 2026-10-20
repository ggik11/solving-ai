import { describe, expect, it } from "vitest";
import { KEYWORDS_VERSION, KEYWORD_RULES, classifyByKeywords } from "@/lib/poster/keywordRules";

describe("KEYWORD_RULES (가이드 12장, keywords-v1)", () => {
  it("버전 식별자가 keywords-v1이다", () => {
    expect(KEYWORDS_VERSION).toBe("keywords-v1");
  });

  it("datasets/keywords-v1.json과 같은 개수(239개)를 담고 있다", () => {
    expect(KEYWORD_RULES).toHaveLength(239);
  });
});

describe("classifyByKeywords — 한글 부분 일치(가이드 12장)", () => {
  it("공백이 섞여 있어도 한글 키워드를 찾는다(예: 해 커 톤 -> 해커톤)", () => {
    const result = classifyByKeywords("해 커 톤 모 집");
    expect(result).not.toBeNull();
    expect(result?.matchedKeywords).toContain("해커톤");
  });

  it("걸린 게 없으면 null이다", () => {
    expect(classifyByKeywords("아무 관련 없는 평범한 문장입니다")).toBeNull();
  });
});

describe("classifyByKeywords — 영문·숫자 단어 경계(가이드 12장)", () => {
  it("AI가 mail 안쪽 글자에는 걸리지 않는다", () => {
    const result = classifyByKeywords("mail 보내는 방법");
    expect(result).toBeNull();
  });

  it("AI가 단어 경계에 홀로 있으면 걸린다", () => {
    const result = classifyByKeywords("AI 설명회 안내");
    expect(result).not.toBeNull();
    expect(result?.matchedKeywords).toContain("AI");
    expect(result?.distribution.IT_ENGINEERING).toBeCloseTo(1);
  });

  it("대소문자를 가리지 않는다", () => {
    const result = classifyByKeywords("ai 설명회 안내");
    expect(result?.matchedKeywords).toContain("AI");
  });
});

describe("classifyByKeywords — 중복 1회만 센다(가이드 12장)", () => {
  it("같은 키워드가 여러 번 나와도 한 번만 집계한다", () => {
    const result = classifyByKeywords("AI AI AI 모집");
    expect(result?.matchedKeywords.filter((w) => w === "AI")).toHaveLength(1);
  });
});

describe("classifyByKeywords — 분야별 가중치 분포(가이드 12장)", () => {
  it("여러 분야의 키워드가 섞이면 가중치 합을 전체 합으로 나눈 분포를 돌려준다", () => {
    // 해커톤(IT_ENGINEERING, 3) + 봉사(SOCIAL_ENVIRONMENT, 3) -> 반반.
    const result = classifyByKeywords("해커톤과 봉사활동을 함께 합니다");
    expect(result).not.toBeNull();
    expect(result?.distribution.IT_ENGINEERING).toBeCloseTo(0.5);
    expect(result?.distribution.SOCIAL_ENVIRONMENT).toBeCloseTo(0.5);
    expect(result?.matchedKeywords.sort()).toEqual(["봉사", "해커톤"]);
  });

  it("한 분야에 여러 가중치의 키워드가 걸리면 합산한다", () => {
    // 해커톤(3) + 데이터(3) + 개발(2) 모두 IT_ENGINEERING.
    const result = classifyByKeywords("해커톤에서 데이터 개발을 합니다");
    expect(result?.distribution.IT_ENGINEERING).toBeCloseTo(1);
    expect(result?.matchedKeywords.sort()).toEqual(["개발", "데이터", "해커톤"]);
  });
});
