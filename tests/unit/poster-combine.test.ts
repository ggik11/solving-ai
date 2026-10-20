import { describe, expect, it } from "vitest";
import { combinePosterSignals, POSTPROCESS_VERSION } from "@/lib/poster/combine";
import { DEFAULT_POSTER_CLASSIFIER_CONFIG, judgePosterClassification } from "@/lib/poster/classifier";

const CONFIG = DEFAULT_POSTER_CLASSIFIER_CONFIG; // top>=0.80, margin>=0.20

describe("POSTPROCESS_VERSION", () => {
  it("postprocess-v1이다", () => {
    expect(POSTPROCESS_VERSION).toBe("postprocess-v1");
  });
});

describe("combinePosterSignals — 글자 신호가 없으면 TM 단독 판정(가이드 12장)", () => {
  it("키워드·임베딩이 둘 다 없으면 기존 judgePosterClassification 결과를 그대로 쓴다", () => {
    const tmScores = [
      { classId: "IT_ENGINEERING", score: 0.9 },
      { classId: "DESIGN_MEDIA", score: 0.05 },
    ];
    const expected = judgePosterClassification(tmScores, CONFIG);

    const result = combinePosterSignals({ tmScores, keyword: null, embedding: null, config: CONFIG });

    expect(result.usedFallback).toBe(true);
    expect(result.status).toBe(expected.status);
    expect(result.finalTopClass).toBe(expected.topClass);
    expect(result.finalTopScore).toBeCloseTo(expected.topScore!);
    expect(result.keywordTopClass).toBeNull();
    expect(result.embedTopClass).toBeNull();
    expect(result.matchedKeywords).toEqual([]);
  });
});

describe("combinePosterSignals — 가중치 재정규화(가이드 12장)", () => {
  it("임베딩이 없으면 TM 0.3/키워드 0.35를 합 1로 다시 맞춘다(0.3/0.65, 0.35/0.65)", () => {
    const tmScores = [
      { classId: "IT_ENGINEERING", score: 0.9 },
      { classId: "DESIGN_MEDIA", score: 0.1 },
    ];
    const keyword = { distribution: { IT_ENGINEERING: 1 }, matchedKeywords: ["해커톤"] };

    const result = combinePosterSignals({ tmScores, keyword, embedding: null, config: CONFIG });

    const expectedScore = (0.3 / 0.65) * 0.9 + (0.35 / 0.65) * 1;
    expect(result.usedFallback).toBe(false);
    expect(result.finalTopClass).toBe("IT_ENGINEERING");
    expect(result.finalTopScore).toBeCloseTo(expectedScore);
  });
});

describe("combinePosterSignals — 합의 규칙(가이드 12장: 2개 이상 1위 일치 + 최종 점수 0.50 이상)", () => {
  it("세 신호 중 2개가 최종 1위와 같고 점수가 0.50 이상이면 suggested", () => {
    const tmScores = [
      { classId: "DESIGN_MEDIA", score: 0.6 },
      { classId: "IT_ENGINEERING", score: 0.4 },
    ];
    const keyword = { distribution: { IT_ENGINEERING: 1 }, matchedKeywords: ["해커톤"] };
    const embedding = { distribution: { IT_ENGINEERING: 0.9, DESIGN_MEDIA: 0.1 } };

    const result = combinePosterSignals({ tmScores, keyword, embedding, config: CONFIG });

    expect(result.tmTopClass).toBe("DESIGN_MEDIA");
    expect(result.keywordTopClass).toBe("IT_ENGINEERING");
    expect(result.embedTopClass).toBe("IT_ENGINEERING");
    expect(result.finalTopClass).toBe("IT_ENGINEERING");
    expect(result.signalAgreement).toBe(2);
    expect(result.finalTopScore).toBeGreaterThanOrEqual(0.5);
    expect(result.status).toBe("suggested");
  });

  it("1개만 최종 1위와 같으면 점수가 높아도 needs_review", () => {
    const tmScores = [
      { classId: "A", score: 0.98 },
      { classId: "B", score: 0.01 },
      { classId: "C", score: 0.01 },
    ];
    const keyword = { distribution: { A: 0.4, B: 0.6 }, matchedKeywords: ["x"] };
    const embedding = { distribution: { A: 0.4, C: 0.6 } };

    const result = combinePosterSignals({ tmScores, keyword, embedding, config: CONFIG });

    expect(result.finalTopClass).toBe("A");
    expect(result.finalTopScore).toBeGreaterThanOrEqual(0.5);
    expect(result.tmTopClass).toBe("A");
    expect(result.keywordTopClass).toBe("B");
    expect(result.embedTopClass).toBe("C");
    expect(result.signalAgreement).toBe(1);
    expect(result.status).toBe("needs_review");
  });

  it("2개가 일치해도 최종 점수가 0.50 미만이면 needs_review", () => {
    const tmScores = [
      { classId: "A", score: 0.34 },
      { classId: "B", score: 0.33 },
      { classId: "C", score: 0.33 },
    ];
    const keyword = { distribution: { A: 0.34, B: 0.33, C: 0.33 }, matchedKeywords: ["x"] };

    const result = combinePosterSignals({ tmScores, keyword, embedding: null, config: CONFIG });

    expect(result.finalTopClass).toBe("A");
    expect(result.signalAgreement).toBe(2);
    expect(result.finalTopScore).toBeLessThan(0.5);
    expect(result.status).toBe("needs_review");
  });
});

describe("combinePosterSignals — CAMPUS_NOTICE(가이드 12장)", () => {
  it("세 신호 모두 CAMPUS_NOTICE를 1위로 꼽아도 분야를 제안하지 않고 needs_review", () => {
    const tmScores = [
      { classId: "CAMPUS_NOTICE", score: 0.9 },
      { classId: "LAW_POLICY", score: 0.1 },
    ];
    const keyword = { distribution: { CAMPUS_NOTICE: 1 }, matchedKeywords: ["상명"] };
    const embedding = { distribution: { CAMPUS_NOTICE: 1 } };

    const result = combinePosterSignals({ tmScores, keyword, embedding, config: CONFIG });

    expect(result.finalTopClass).toBe("CAMPUS_NOTICE");
    expect(result.signalAgreement).toBe(3);
    expect(result.finalTopScore).toBeGreaterThanOrEqual(0.9);
    expect(result.status).toBe("needs_review");
  });
});

describe("combinePosterSignals — 근거 키워드", () => {
  it("matchedKeywords는 키워드 신호의 걸린 단어 목록을 그대로 전달한다", () => {
    const tmScores = [{ classId: "IT_ENGINEERING", score: 0.5 }];
    const keyword = { distribution: { IT_ENGINEERING: 1 }, matchedKeywords: ["해커톤", "AI"] };

    const result = combinePosterSignals({ tmScores, keyword, embedding: null, config: CONFIG });

    expect(result.matchedKeywords).toEqual(["해커톤", "AI"]);
  });
});
