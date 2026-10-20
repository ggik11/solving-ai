import { describe, expect, it } from "vitest";
import {
  DEFAULT_POSTER_CLASSIFIER_CONFIG,
  classHasNoServiceField,
  hasClassFieldMapFor,
  judgePosterClassification,
  resolveCandidateInterestIds,
  type ModelClassFieldMapRow,
} from "@/lib/poster/classifier";

const CONFIG = DEFAULT_POSTER_CLASSIFIER_CONFIG; // top>=0.80, margin>=0.20

describe("judgePosterClassification (가이드 5.5)", () => {
  it("1위 점수와 margin이 모두 기준을 넘으면 suggested", () => {
    const result = judgePosterClassification(
      [
        { classId: "IT_DATA", score: 0.85 },
        { classId: "DESIGN_MEDIA", score: 0.1 },
      ],
      CONFIG
    );
    expect(result.status).toBe("suggested");
    expect(result.topClass).toBe("IT_DATA");
    expect(result.topScore).toBeCloseTo(0.85);
    expect(result.margin).toBeCloseTo(0.75);
  });

  it("1위 점수는 기준을 넘지만 margin이 부족하면 needs_review", () => {
    const result = judgePosterClassification(
      [
        { classId: "IT_DATA", score: 0.85 },
        { classId: "DESIGN_MEDIA", score: 0.75 },
      ],
      CONFIG
    );
    expect(result.status).toBe("needs_review");
  });

  it("1위 점수 자체가 기준 미만이면 needs_review", () => {
    const result = judgePosterClassification(
      [
        { classId: "IT_DATA", score: 0.5 },
        { classId: "DESIGN_MEDIA", score: 0.3 },
      ],
      CONFIG
    );
    expect(result.status).toBe("needs_review");
  });

  it("클래스가 하나뿐이면(2위가 없음) margin은 1위 점수 그대로 계산된다", () => {
    const result = judgePosterClassification([{ classId: "IT_DATA", score: 0.9 }], CONFIG);
    expect(result.status).toBe("suggested");
    expect(result.margin).toBeCloseTo(0.9);
  });

  it("scores가 비어 있으면 호출 자체를 거부한다(실패 처리는 호출부 책임)", () => {
    expect(() => judgePosterClassification([], CONFIG)).toThrow();
  });
});

describe("resolveCandidateInterestIds / hasClassFieldMapFor (가이드 3.6)", () => {
  const MAP: ModelClassFieldMapRow[] = [
    { modelVersion: "v1", classId: "IT_DATA", interestId: "interest-it-data" },
    { modelVersion: "v1", classId: "SOCIAL_ENVIRONMENT", interestId: "interest-social-welfare" },
    { modelVersion: "v1", classId: "SOCIAL_ENVIRONMENT", interestId: "interest-energy-environment" },
  ];

  it("한 클래스가 여러 후보로 연결될 수 있다", () => {
    const candidates = resolveCandidateInterestIds("SOCIAL_ENVIRONMENT", "v1", MAP);
    expect(candidates.sort()).toEqual(["interest-energy-environment", "interest-social-welfare"].sort());
  });

  it("연결표에 없는 클래스는 빈 배열을 반환한다", () => {
    expect(resolveCandidateInterestIds("SPORTS", "v1", MAP)).toEqual([]);
  });

  it("모델 버전이 다르면 연결되지 않는다", () => {
    expect(resolveCandidateInterestIds("IT_DATA", "v2", MAP)).toEqual([]);
  });

  it("labels 중 하나라도 연결표에 있으면 매핑이 있다고 본다", () => {
    expect(hasClassFieldMapFor("v1", ["IT_DATA", "BUSINESS_PLANNING"], MAP)).toBe(true);
  });

  it("모델 버전의 어떤 라벨도 연결표에 없으면 매핑 없음(연결표 없음 경고 대상)", () => {
    expect(hasClassFieldMapFor("v2", ["IT_DATA"], MAP)).toBe(false);
    expect(hasClassFieldMapFor("v1", ["SPORTS"], MAP)).toBe(false);
  });
});

describe("classHasNoServiceField / resolveCandidateInterestIds — 서비스 분야 없는 클래스(가이드 3.6 보완, 예: CAMPUS_NOTICE)", () => {
  const MAP_WITH_NO_FIELD_CLASS: ModelClassFieldMapRow[] = [
    { modelVersion: "v1", classId: "IT_DATA", interestId: "interest-it-data" },
    { modelVersion: "v1", classId: "CAMPUS_NOTICE", interestId: null },
  ];

  it("interest_id가 null인 행이 있으면 '서비스 분야 없음' 클래스로 본다", () => {
    expect(classHasNoServiceField("CAMPUS_NOTICE", "v1", MAP_WITH_NO_FIELD_CLASS)).toBe(true);
  });

  it("interest_id가 실제로 있으면 '서비스 분야 없음'이 아니다", () => {
    expect(classHasNoServiceField("IT_DATA", "v1", MAP_WITH_NO_FIELD_CLASS)).toBe(false);
  });

  it("연결표 자체에 없는 클래스는 '서비스 분야 없음'으로 보지 않는다(연결표 없음과는 다른 경우)", () => {
    expect(classHasNoServiceField("SPORTS", "v1", MAP_WITH_NO_FIELD_CLASS)).toBe(false);
  });

  it("모델 버전이 다르면 '서비스 분야 없음' 표시가 적용되지 않는다", () => {
    expect(classHasNoServiceField("CAMPUS_NOTICE", "v2", MAP_WITH_NO_FIELD_CLASS)).toBe(false);
  });

  it("interest_id가 null인 행은 후보 목록에서 제외된다(분야를 제안하지 않음)", () => {
    expect(resolveCandidateInterestIds("CAMPUS_NOTICE", "v1", MAP_WITH_NO_FIELD_CLASS)).toEqual([]);
  });
});
