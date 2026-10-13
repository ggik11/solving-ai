import { describe, expect, it } from "vitest";
import {
  computeAccuracy,
  computeClassMetrics,
  computeConfusionMatrix,
  computeMacroF1,
  computeMajorityBaselineAccuracy,
  computeOodSuggestedRate,
  computeThresholdSweep,
  computeUnseenOrgAccuracy,
  type LabeledPrediction,
} from "@/lib/modelLab/metrics";

// 가이드 6.3 — 지표 계산 함수는 순수 함수라 실제 모델 없이도(목 예측값으로) 검증한다.
// 이 함수들은 "정답 라벨이 있는 행"을 그대로 분모로 쓰므로, 호출부가 원하는 split만 미리
// 걸러서 넘긴다(train 라벨까지 정확도에 섞이지 않도록) — TEST_SAMPLE이 그 예시다.
const SAMPLE: LabeledPrediction[] = [
  { id: "1", trueLabel: "IT_DATA", predictedLabel: "IT_DATA", topScore: 0.9, margin: 0.8, split: "test", orgName: "A재단" },
  { id: "2", trueLabel: "IT_DATA", predictedLabel: "DESIGN_MEDIA", topScore: 0.6, margin: 0.1, split: "test", orgName: "A재단" },
  { id: "3", trueLabel: "DESIGN_MEDIA", predictedLabel: "DESIGN_MEDIA", topScore: 0.85, margin: 0.3, split: "test", orgName: "B재단" },
  { id: "4", trueLabel: "DESIGN_MEDIA", predictedLabel: "DESIGN_MEDIA", topScore: 0.95, margin: 0.5, split: "test", orgName: "C재단" },
  { id: "5", trueLabel: "IT_DATA", predictedLabel: null, topScore: null, margin: null, split: "train", orgName: "A재단" },
];
const TEST_SAMPLE = SAMPLE.filter((p) => p.split === "test");

describe("computeAccuracy", () => {
  it("정답 라벨이 있는 행만 분모로 정확도를 계산한다", () => {
    const result = computeAccuracy(TEST_SAMPLE);
    expect(result).toEqual({ correct: 3, total: 4, accuracy: 0.75 });
  });

  it("정답 라벨이 하나도 없으면 0을 반환한다(0으로 나누지 않음)", () => {
    expect(computeAccuracy([]).accuracy).toBe(0);
  });
});

describe("computeMajorityBaselineAccuracy", () => {
  it("가장 많은 분야를 항상 고를 때의 정확도를 계산한다", () => {
    // test split 4건 중 IT_DATA 2건, DESIGN_MEDIA 2건 — 동률이면 sort 안정성에 따라 하나가 선택된다.
    const result = computeMajorityBaselineAccuracy(TEST_SAMPLE);
    expect(result.accuracy).toBe(0.5);
  });
});

describe("computeConfusionMatrix", () => {
  it("실제×예측 건수를 집계하고, 예측 실패는 _none으로 센다", () => {
    const { classes, matrix } = computeConfusionMatrix(TEST_SAMPLE);
    expect(classes).toEqual(["DESIGN_MEDIA", "IT_DATA"]);
    expect(matrix.IT_DATA).toEqual({ IT_DATA: 1, DESIGN_MEDIA: 1 });
    expect(matrix.DESIGN_MEDIA).toEqual({ DESIGN_MEDIA: 2 });
  });
});

describe("computeClassMetrics / computeMacroF1", () => {
  it("분야별 정밀도·재현율·F1을 계산한다", () => {
    const metrics = computeClassMetrics(TEST_SAMPLE);
    const itData = metrics.find((m) => m.classId === "IT_DATA")!;
    expect(itData.support).toBe(2);
    expect(itData.recall).toBe(0.5); // 2건 중 1건만 맞음
    expect(itData.precision).toBe(1); // IT_DATA로 예측된 건 1건, 전부 정답

    const designMedia = metrics.find((m) => m.classId === "DESIGN_MEDIA")!;
    expect(designMedia.recall).toBe(1);
    expect(designMedia.precision).toBeCloseTo(2 / 3); // DESIGN_MEDIA로 예측된 건 3건(2 IT_DATA중 1건 포함), 2건만 정답

    const macroF1 = computeMacroF1(metrics);
    expect(macroF1).toBeGreaterThan(0);
    expect(macroF1).toBeLessThanOrEqual(1);
  });

  it("분야가 없으면 macro-F1은 0이다", () => {
    expect(computeMacroF1([])).toBe(0);
  });
});

describe("computeThresholdSweep", () => {
  it("임계값별 통과율과 통과 자료 정확도를 계산한다", () => {
    const sweep = computeThresholdSweep(TEST_SAMPLE, [
      { minTopScore: 0.8, minMargin: 0.2 },
      { minTopScore: 0.5, minMargin: 0.0 },
    ]);
    // 0.8/0.2 기준: id 1(0.9,0.8)·3(0.85,0.3)·4(0.95,0.5) 통과, 2(0.6,0.1)는 탈락.
    expect(sweep[0]).toMatchObject({ passedCount: 3, accuracyAmongPassed: 1 });
    // 0.5/0.0 기준: 1,2,3,4 모두 통과, 2는 오답이라 정확도 0.75.
    expect(sweep[1]).toMatchObject({ passedCount: 4, accuracyAmongPassed: 0.75 });
  });
});

describe("computeOodSuggestedRate", () => {
  it("ood 자료 중 임계값을 넘겨 suggested로 판정되는 비율을 계산한다", () => {
    const ood: LabeledPrediction[] = [
      { id: "o1", trueLabel: null, predictedLabel: "IT_DATA", topScore: 0.9, margin: 0.8, split: "ood", orgName: null },
      { id: "o2", trueLabel: null, predictedLabel: "DESIGN_MEDIA", topScore: 0.4, margin: 0.1, split: "ood", orgName: null },
    ];
    const result = computeOodSuggestedRate(ood, { minTopScore: 0.8, minMargin: 0.2 });
    expect(result).toEqual({ total: 2, suggestedCount: 1, suggestedRate: 0.5, suggestedIds: ["o1"] });
  });

  it("ood 자료가 없으면 0을 반환한다", () => {
    expect(computeOodSuggestedRate([], { minTopScore: 0.8, minMargin: 0.2 }).suggestedRate).toBe(0);
  });
});

describe("computeUnseenOrgAccuracy", () => {
  it("train에 없던 기관의 자료만 골라 정확도를 계산한다", () => {
    const predictions: LabeledPrediction[] = [
      ...SAMPLE,
      // test 자료가 쓰는 기관(B재단·C재단)도 train에 있었다고 표시해 둔다 — 그래야 "새기관"만
      // 진짜로 처음 보는 기관이 된다.
      { id: "t-b", trueLabel: "DESIGN_MEDIA", predictedLabel: "DESIGN_MEDIA", topScore: 0.9, margin: 0.8, split: "train", orgName: "B재단" },
      { id: "t-c", trueLabel: "DESIGN_MEDIA", predictedLabel: "DESIGN_MEDIA", topScore: 0.9, margin: 0.8, split: "train", orgName: "C재단" },
      { id: "6", trueLabel: "IT_DATA", predictedLabel: "IT_DATA", topScore: 0.9, margin: 0.8, split: "test", orgName: "새기관" },
    ];
    const result = computeUnseenOrgAccuracy(predictions);
    expect(result).toEqual({ total: 1, accuracy: 1 });
  });
});
