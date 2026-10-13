/**
 * 모델 평가 지표(가이드 6.3) — 전부 순수 함수라 실제 모델 없이도(목 예측값으로) 단위 테스트할
 * 수 있다. 목 예측값은 지표 계산 자체를 검증하는 용도로만 쓰고, 실제 서비스 분석 경로
 * (src/lib/poster/analyze.ts)에는 손대지 않는다.
 */

export type DatasetSplit = "train" | "dev" | "test" | "ood";

export interface LabeledPrediction {
  id: string;
  /** manifest의 정답 라벨(모델 클래스 ID). ood는 "학습 범위 밖"이라 정답 라벨이 없을 수 있다. */
  trueLabel: string | null;
  /** 모델이 고른 1위 클래스. 예측 실패(모델 없음 등)면 null. */
  predictedLabel: string | null;
  topScore: number | null;
  margin: number | null;
  split: DatasetSplit;
  orgName: string | null;
}

/** test(또는 지정한) split만 골라, 정답 라벨이 있고 예측도 있는 행만 정확도 분모로 쓴다. */
function withGroundTruth(predictions: LabeledPrediction[]): (LabeledPrediction & { trueLabel: string })[] {
  return predictions.filter((p): p is LabeledPrediction & { trueLabel: string } => p.trueLabel !== null);
}

export function computeAccuracy(predictions: LabeledPrediction[]): { correct: number; total: number; accuracy: number } {
  const labeled = withGroundTruth(predictions);
  const total = labeled.length;
  const correct = labeled.filter((p) => p.predictedLabel === p.trueLabel).length;
  return { correct, total, accuracy: total === 0 ? 0 : correct / total };
}

/** 다수 클래스 기준선 — 항상 가장 많은 분야를 고를 때의 정확도(가이드 6.3). */
export function computeMajorityBaselineAccuracy(predictions: LabeledPrediction[]): { majorityLabel: string | null; accuracy: number } {
  const labeled = withGroundTruth(predictions);
  if (labeled.length === 0) return { majorityLabel: null, accuracy: 0 };
  const counts = new Map<string, number>();
  for (const p of labeled) counts.set(p.trueLabel, (counts.get(p.trueLabel) ?? 0) + 1);
  const [majorityLabel, majorityCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return { majorityLabel, accuracy: majorityCount / labeled.length };
}

export interface ConfusionMatrix {
  classes: string[];
  /** matrix[true][predicted] = 건수. "predicted"에는 예측 실패를 나타내는 특수 라벨 "_none"도 포함될 수 있다. */
  matrix: Record<string, Record<string, number>>;
}

const NO_PREDICTION = "_none";

export function computeConfusionMatrix(predictions: LabeledPrediction[]): ConfusionMatrix {
  const labeled = withGroundTruth(predictions);
  const classes = [...new Set(labeled.map((p) => p.trueLabel))].sort();
  const matrix: Record<string, Record<string, number>> = {};
  for (const c of classes) matrix[c] = {};
  for (const p of labeled) {
    const predicted = p.predictedLabel ?? NO_PREDICTION;
    matrix[p.trueLabel][predicted] = (matrix[p.trueLabel][predicted] ?? 0) + 1;
  }
  return { classes, matrix };
}

export interface ClassMetric {
  classId: string;
  support: number;
  precision: number;
  recall: number;
  f1: number;
}

/** 분야별 정밀도·재현율·F1(가이드 6.3). */
export function computeClassMetrics(predictions: LabeledPrediction[]): ClassMetric[] {
  const labeled = withGroundTruth(predictions);
  const classes = [...new Set(labeled.map((p) => p.trueLabel))].sort();
  return classes.map((classId) => {
    const support = labeled.filter((p) => p.trueLabel === classId).length;
    const truePositive = labeled.filter((p) => p.trueLabel === classId && p.predictedLabel === classId).length;
    const predictedPositive = labeled.filter((p) => p.predictedLabel === classId).length;
    const precision = predictedPositive === 0 ? 0 : truePositive / predictedPositive;
    const recall = support === 0 ? 0 : truePositive / support;
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    return { classId, support, precision, recall, f1 };
  });
}

export function computeMacroF1(classMetrics: ClassMetric[]): number {
  if (classMetrics.length === 0) return 0;
  return classMetrics.reduce((sum, m) => sum + m.f1, 0) / classMetrics.length;
}

export interface ThresholdConfig {
  minTopScore: number;
  minMargin: number;
}

export interface ThresholdSweepRow extends ThresholdConfig {
  /** 이 임계값으로 "suggested" 판정을 받는 자료의 비율. */
  passRate: number;
  /** 그 통과한 자료만 놓고 봤을 때의 정확도. */
  accuracyAmongPassed: number;
  passedCount: number;
}

/** 여러 임계값 조합에서의 통과율·통과 자료 정확도(가이드 6.3). */
export function computeThresholdSweep(predictions: LabeledPrediction[], thresholds: ThresholdConfig[]): ThresholdSweepRow[] {
  const labeled = withGroundTruth(predictions);
  return thresholds.map((t) => {
    const passed = labeled.filter((p) => (p.topScore ?? 0) >= t.minTopScore && (p.margin ?? 0) >= t.minMargin);
    const correct = passed.filter((p) => p.predictedLabel === p.trueLabel).length;
    return {
      ...t,
      passRate: labeled.length === 0 ? 0 : passed.length / labeled.length,
      accuracyAmongPassed: passed.length === 0 ? 0 : correct / passed.length,
      passedCount: passed.length,
    };
  });
}

export interface OodSummary {
  total: number;
  suggestedCount: number;
  suggestedRate: number;
  suggestedIds: string[];
}

/** 범위 밖(ood) 이미지 중 suggested로 판정된 비율과 목록(가이드 6.3) — 모델이 "모르는" 이미지를 자신 있게 잘못 판정하는지 본다. */
export function computeOodSuggestedRate(predictions: LabeledPrediction[], threshold: ThresholdConfig): OodSummary {
  const ood = predictions.filter((p) => p.split === "ood");
  const suggested = ood.filter((p) => (p.topScore ?? 0) >= threshold.minTopScore && (p.margin ?? 0) >= threshold.minMargin);
  return {
    total: ood.length,
    suggestedCount: suggested.length,
    suggestedRate: ood.length === 0 ? 0 : suggested.length / ood.length,
    suggestedIds: suggested.map((p) => p.id),
  };
}

/** 학습 자료에 없던 기관의 포스터만 따로 본 정확도(가이드 6.3). */
export function computeUnseenOrgAccuracy(predictions: LabeledPrediction[]): { total: number; accuracy: number } {
  const trainOrgs = new Set(predictions.filter((p) => p.split === "train" && p.orgName).map((p) => p.orgName as string));
  const unseen = withGroundTruth(predictions).filter((p) => p.orgName && !trainOrgs.has(p.orgName));
  const correct = unseen.filter((p) => p.predictedLabel === p.trueLabel).length;
  return { total: unseen.length, accuracy: unseen.length === 0 ? 0 : correct / unseen.length };
}
