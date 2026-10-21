/**
 * 포스터 2차 후처리 P5(가이드 12장) — "단계별 비교" 순수 계산. TM·OCR·키워드·임베딩 신호를
 * (호출부가 먼저 계산해) 받아서 4가지 방식(A: TM만 / B: TM+키워드 / C: TM+임베딩 /
 * D: TM+키워드+임베딩+합의 규칙)을 전부 계산한다. keywordRules/embeddingClassifier/combine의
 * 규칙·가중치는 그대로 쓴다(여기서 다시 정의하거나 바꾸지 않는다) — B·C도 combine.ts의 재정규화·
 * 판정 규칙을 그대로 쓰고 빠진 신호만 없는 것으로 넘긴다.
 */
import { judgePosterClassification, type ClassScore, type PosterClassifierConfig } from "@/lib/poster/classifier";
import { combinePosterSignals } from "@/lib/poster/combine";
import type { KeywordClassification } from "@/lib/poster/keywordRules";
import type { EmbeddingClassification } from "@/lib/poster/embeddingClassifier";
import {
  computeAccuracy,
  computeClassMetrics,
  computeConfusionMatrix,
  computeMacroF1,
  computeUnseenOrgAccuracy,
  type ClassMetric,
  type ConfusionMatrix,
  type LabeledPrediction,
} from "./metrics";

export interface ManifestSplitLookup {
  split: string;
  label: string;
  orgName: string | null;
}

export interface SplitFilterResult {
  /** split=test로 확인된 파일명 — 이것만 평가한다. */
  testFilenames: string[];
  /** train split로 확인된 파일명 — 평가하지 않고 경고로만 보여준다(가이드 12장 P5). */
  trainWarnings: string[];
  /** 그 외(dev/ood, 또는 manifest에 없음) — 평가 대상이 아니다. */
  skipped: string[];
}

/** 업로드한 이미지 파일명을 manifest의 split과 대조해 test만 골라낸다. train이 섞여 있으면
 * 평가하지 않고 경고 목록에 담는다 — 평가용(test) 사진만 한 번 평가한다는 원칙을 지킨다. */
export function filterTestSplitFiles(filenames: string[], manifestByFilename: Map<string, ManifestSplitLookup>): SplitFilterResult {
  const testFilenames: string[] = [];
  const trainWarnings: string[] = [];
  const skipped: string[] = [];
  for (const filename of filenames) {
    const row = manifestByFilename.get(filename);
    if (!row) {
      skipped.push(filename);
      continue;
    }
    if (row.split === "test") {
      testFilenames.push(filename);
    } else if (row.split === "train") {
      trainWarnings.push(filename);
    } else {
      skipped.push(filename);
    }
  }
  return { testFilenames, trainWarnings, skipped };
}

/** 평가 대상 이미지 한 장의 신호(TM·OCR·키워드·임베딩을 전부 한 번씩만 계산해 넘긴다). */
export interface ComparisonRow {
  id: string;
  trueLabel: string;
  orgName: string | null;
  tmScores: ClassScore[];
  ocrOk: boolean;
  keyword: KeywordClassification | null;
  embedding: EmbeddingClassification | null;
}

export interface VariantPrediction {
  predictedLabel: string | null;
  suggested: boolean;
}

export interface RowVariants {
  A: VariantPrediction;
  B: VariantPrediction;
  C: VariantPrediction;
  D: VariantPrediction;
  tmTopClass: string | null;
  keywordTopClass: string | null;
  embedTopClass: string | null;
  /** D(세 신호 모두)의 일치 개수 — CSV·화면 표시용. */
  signalAgreement: number;
  matchedKeywords: string[];
  /** OCR 실패 또는 키워드·임베딩 둘 다 없음. */
  noTextSignal: boolean;
}

/** 한 이미지의 신호로 A~D 네 방식을 전부 계산한다(순수 함수). */
export function computeRowVariants(row: ComparisonRow, config: PosterClassifierConfig): RowVariants {
  const tmJudgment = judgePosterClassification(row.tmScores, config);
  const combineB = combinePosterSignals({ tmScores: row.tmScores, keyword: row.keyword, embedding: null, config });
  const combineC = combinePosterSignals({ tmScores: row.tmScores, keyword: null, embedding: row.embedding, config });
  const combineD = combinePosterSignals({ tmScores: row.tmScores, keyword: row.keyword, embedding: row.embedding, config });

  return {
    A: { predictedLabel: tmJudgment.topClass, suggested: tmJudgment.status === "suggested" },
    B: { predictedLabel: combineB.finalTopClass, suggested: combineB.status === "suggested" },
    C: { predictedLabel: combineC.finalTopClass, suggested: combineC.status === "suggested" },
    D: { predictedLabel: combineD.finalTopClass, suggested: combineD.status === "suggested" },
    tmTopClass: combineD.tmTopClass,
    keywordTopClass: combineD.keywordTopClass,
    embedTopClass: combineD.embedTopClass,
    signalAgreement: combineD.signalAgreement,
    matchedKeywords: combineD.matchedKeywords,
    noTextSignal: !row.ocrOk || (row.keyword == null && row.embedding == null),
  };
}

export interface VariantReport {
  accuracy: { correct: number; total: number; accuracy: number };
  macroF1: number;
  classMetrics: ClassMetric[];
  confusionMatrix: ConfusionMatrix;
  suggestedRate: number;
  accuracyAmongSuggested: { correct: number; total: number; accuracy: number };
  unseenOrgAccuracy: { total: number; accuracy: number };
}

interface RowForMetrics extends LabeledPrediction {
  suggested: boolean;
}

/** trainOrgNames는 "학습 자료에 있던 기관"만 알려주는 용도(가이드 6.3 처음 보는 기관 정확도와
 * 같은 방식) — 실제 예측을 갖진 않는다. */
function toMetricsRows(
  rows: (ComparisonRow & { variant: VariantPrediction })[],
  trainOrgNames: string[]
): RowForMetrics[] {
  const trainSeed: RowForMetrics[] = trainOrgNames.map((orgName, i) => ({
    id: `__train_org_${i}`,
    trueLabel: null,
    predictedLabel: null,
    topScore: null,
    margin: null,
    split: "train",
    orgName,
    suggested: false,
  }));
  const testRows: RowForMetrics[] = rows.map((r) => ({
    id: r.id,
    trueLabel: r.trueLabel,
    predictedLabel: r.variant.predictedLabel,
    topScore: null,
    margin: null,
    split: "test",
    orgName: r.orgName,
    suggested: r.variant.suggested,
  }));
  return [...trainSeed, ...testRows];
}

function computeVariantReport(rows: RowForMetrics[]): VariantReport {
  const classMetrics = computeClassMetrics(rows);
  const testRows = rows.filter((r) => r.split === "test");
  const suggested = testRows.filter((r) => r.suggested);
  return {
    accuracy: computeAccuracy(rows),
    macroF1: computeMacroF1(classMetrics),
    classMetrics,
    confusionMatrix: computeConfusionMatrix(rows),
    suggestedRate: testRows.length === 0 ? 0 : suggested.length / testRows.length,
    accuracyAmongSuggested: computeAccuracy(suggested),
    unseenOrgAccuracy: computeUnseenOrgAccuracy(rows),
  };
}

export interface StandaloneAccuracy {
  tm: { correct: number; total: number; accuracy: number };
  keyword: { correct: number; total: number; accuracy: number };
  embedding: { correct: number; total: number; accuracy: number };
}

export interface ComparisonRowWithVariants extends ComparisonRow {
  variants: RowVariants;
}

export interface ComparisonReport {
  total: number;
  variants: { A: VariantReport; B: VariantReport; C: VariantReport; D: VariantReport };
  /** 신호별 "단독" 1위 정확도(결합 없이 그 신호 하나만 봤을 때) — 참고용. */
  standaloneAccuracy: StandaloneAccuracy;
  noTextSignalRate: number;
  rows: ComparisonRowWithVariants[];
}

/** test split 이미지 전체(이미 TM·OCR·키워드·임베딩을 계산해 둔 rows)로 A~D 비교 보고서를 만든다. */
export function computeComparisonReport(
  rows: ComparisonRow[],
  trainOrgNames: string[],
  config: PosterClassifierConfig
): ComparisonReport {
  const withVariants: ComparisonRowWithVariants[] = rows.map((row) => ({ ...row, variants: computeRowVariants(row, config) }));

  const reportFor = (key: "A" | "B" | "C" | "D"): VariantReport =>
    computeVariantReport(toMetricsRows(withVariants.map((r) => ({ ...r, variant: r.variants[key] })), trainOrgNames));

  const standaloneRows = (key: "tm" | "keyword" | "embedding"): RowForMetrics[] => {
    const field = key === "tm" ? "tmTopClass" : key === "keyword" ? "keywordTopClass" : "embedTopClass";
    return toMetricsRows(
      withVariants.map((r) => ({ ...r, variant: { predictedLabel: r.variants[field], suggested: false } })),
      trainOrgNames
    );
  };

  const noTextSignalCount = withVariants.filter((r) => r.variants.noTextSignal).length;

  return {
    total: rows.length,
    variants: { A: reportFor("A"), B: reportFor("B"), C: reportFor("C"), D: reportFor("D") },
    standaloneAccuracy: {
      tm: computeAccuracy(standaloneRows("tm").filter((r) => r.split === "test")),
      keyword: computeAccuracy(standaloneRows("keyword").filter((r) => r.split === "test")),
      embedding: computeAccuracy(standaloneRows("embedding").filter((r) => r.split === "test")),
    },
    noTextSignalRate: rows.length === 0 ? 0 : noTextSignalCount / rows.length,
    rows: withVariants,
  };
}
