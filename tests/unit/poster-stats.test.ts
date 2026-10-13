import { describe, expect, it } from "vitest";
import { computeFieldAcceptanceRates, computeVerdictRatios } from "@/lib/poster/stats";
import type { ModelClassFieldMapRow } from "@/lib/poster/classifier";

describe("computeVerdictRatios (가이드 5.6)", () => {
  it("분석 기록이 없으면 전부 0건·0비율이다", () => {
    const result = computeVerdictRatios([]);
    expect(result).toEqual([
      { status: "suggested", count: 0, ratio: 0 },
      { status: "needs_review", count: 0, ratio: 0 },
      { status: "failed", count: 0, ratio: 0 },
    ]);
  });

  it("상태별 건수와 비율을 계산한다", () => {
    const result = computeVerdictRatios([
      { status: "suggested" }, { status: "suggested" },
      { status: "needs_review" },
      { status: "failed" },
    ]);
    expect(result).toEqual([
      { status: "suggested", count: 2, ratio: 0.5 },
      { status: "needs_review", count: 1, ratio: 0.25 },
      { status: "failed", count: 1, ratio: 0.25 },
    ]);
  });
});

describe("computeFieldAcceptanceRates (가이드 5.6)", () => {
  const classFieldMap: ModelClassFieldMapRow[] = [
    { modelVersion: "v1", classId: "IT_DATA", interestId: "IT_DATA_ID" },
    { modelVersion: "v1", classId: "SOCIAL_ENVIRONMENT", interestId: "SOCIAL_ID" },
    { modelVersion: "v1", classId: "SOCIAL_ENVIRONMENT", interestId: "ENV_ID" },
  ];

  it("후보로 제안된 분야 중 실제로 그대로 수락해 확정된 비율을 계산한다", () => {
    const analyses = [
      { id: "a1", modelVersion: "v1", topClass: "IT_DATA" },
      { id: "a2", modelVersion: "v1", topClass: "IT_DATA" },
    ];
    const confirmed = [
      { analysisId: "a1", interestId: "IT_DATA_ID", acceptedModelCandidate: true },
      { analysisId: "a2", interestId: "IT_DATA_ID", acceptedModelCandidate: false },
    ];
    const result = computeFieldAcceptanceRates(analyses, classFieldMap, confirmed);
    expect(result).toEqual([{ interestId: "IT_DATA_ID", candidateCount: 2, acceptedCount: 1, rate: 0.5 }]);
  });

  it("한 클래스가 여러 분야 후보로 연결되면 각 분야에 후보 건수가 각각 쌓인다", () => {
    const analyses = [{ id: "a1", modelVersion: "v1", topClass: "SOCIAL_ENVIRONMENT" }];
    const confirmed = [{ analysisId: "a1", interestId: "SOCIAL_ID", acceptedModelCandidate: true }];
    const result = computeFieldAcceptanceRates(analyses, classFieldMap, confirmed);
    expect(result).toEqual(
      expect.arrayContaining([
        { interestId: "SOCIAL_ID", candidateCount: 1, acceptedCount: 1, rate: 1 },
        { interestId: "ENV_ID", candidateCount: 1, acceptedCount: 0, rate: 0 },
      ])
    );
  });

  it("다른 분석의 확정 기록은 섞어 세지 않는다(analysisId가 다르면 수락으로 치지 않음)", () => {
    const analyses = [{ id: "a1", modelVersion: "v1", topClass: "IT_DATA" }];
    const confirmed = [{ analysisId: "a-other", interestId: "IT_DATA_ID", acceptedModelCandidate: true }];
    const result = computeFieldAcceptanceRates(analyses, classFieldMap, confirmed);
    expect(result).toEqual([{ interestId: "IT_DATA_ID", candidateCount: 1, acceptedCount: 0, rate: 0 }]);
  });

  it("후보 분석이 없으면 빈 배열이다", () => {
    expect(computeFieldAcceptanceRates([], classFieldMap, [])).toEqual([]);
  });
});
