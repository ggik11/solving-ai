import { describe, expect, it } from "vitest";
import {
  computeComparisonReport,
  computeRowVariants,
  filterTestSplitFiles,
  type ComparisonRow,
  type ManifestSplitLookup,
} from "@/lib/modelLab/postprocessCompare";
import { DEFAULT_POSTER_CLASSIFIER_CONFIG } from "@/lib/poster/classifier";

const CONFIG = DEFAULT_POSTER_CLASSIFIER_CONFIG; // top>=0.80, margin>=0.20

describe("filterTestSplitFiles (가이드 12장 P5 — train 사진이 섞이면 평가하지 말고 경고)", () => {
  it("test는 평가 대상, train은 경고, 그 외·미등록은 건너뛴다", () => {
    const manifest = new Map<string, ManifestSplitLookup>([
      ["a.png", { split: "test", label: "IT_ENGINEERING", orgName: null }],
      ["b.png", { split: "train", label: "IT_ENGINEERING", orgName: null }],
      ["c.png", { split: "dev", label: "IT_ENGINEERING", orgName: null }],
    ]);
    const result = filterTestSplitFiles(["a.png", "b.png", "c.png", "d.png"], manifest);
    expect(result).toEqual({
      testFilenames: ["a.png"],
      trainWarnings: ["b.png"],
      skipped: ["c.png", "d.png"],
    });
  });

  it("아무것도 없으면 전부 빈 배열이다", () => {
    expect(filterTestSplitFiles([], new Map())).toEqual({ testFilenames: [], trainWarnings: [], skipped: [] });
  });
});

describe("computeRowVariants — A~D 네 방식(가이드 12장 P5)", () => {
  it("A(TM만)/B(TM+키워드)/C(TM+임베딩)/D(전부)가 서로 다른 결과를 낼 수 있다", () => {
    const row: ComparisonRow = {
      id: "a.png",
      trueLabel: "IT_ENGINEERING",
      orgName: null,
      tmScores: [
        { classId: "IT_ENGINEERING", score: 0.9 },
        { classId: "DESIGN_MEDIA", score: 0.05 },
      ],
      ocrOk: true,
      keyword: { distribution: { IT_ENGINEERING: 1 }, matchedKeywords: ["해커톤"] },
      embedding: { distribution: { DESIGN_MEDIA: 1 } },
    };

    const result = computeRowVariants(row, CONFIG);

    // A: TM 단독 판정 그대로 — top 0.9>=0.8, margin 0.85>=0.2 → suggested.
    expect(result.A).toEqual({ predictedLabel: "IT_ENGINEERING", suggested: true });
    // B: TM+키워드(임베딩 없음) — 둘 다 IT_ENGINEERING 1위라 2/2 일치, 점수도 0.5 이상.
    expect(result.B).toEqual({ predictedLabel: "IT_ENGINEERING", suggested: true });
    // C: TM+임베딩(키워드 없음) — 임베딩 비중(0.35/0.65)이 더 커서 최종 1위가 DESIGN_MEDIA로
    // 바뀌지만, 일치하는 신호가 1개뿐이라(임베딩만) needs_review.
    expect(result.C.predictedLabel).toBe("DESIGN_MEDIA");
    expect(result.C.suggested).toBe(false);
    // D: 세 신호 모두 — TM·키워드가 같은 1위(IT_ENGINEERING)라 2/3 일치 + 점수 0.5 이상 → suggested.
    expect(result.D).toEqual({ predictedLabel: "IT_ENGINEERING", suggested: true });

    expect(result.tmTopClass).toBe("IT_ENGINEERING");
    expect(result.keywordTopClass).toBe("IT_ENGINEERING");
    expect(result.embedTopClass).toBe("DESIGN_MEDIA");
    expect(result.signalAgreement).toBe(2);
    expect(result.matchedKeywords).toEqual(["해커톤"]);
    expect(result.noTextSignal).toBe(false);
  });

  it("OCR이 실패하면(ocrOk=false) noTextSignal이 true다 — 키워드·임베딩이 있어도", () => {
    const row: ComparisonRow = {
      id: "b.png",
      trueLabel: "IT_ENGINEERING",
      orgName: null,
      tmScores: [{ classId: "IT_ENGINEERING", score: 0.9 }],
      ocrOk: false,
      keyword: { distribution: { IT_ENGINEERING: 1 }, matchedKeywords: ["해커톤"] },
      embedding: { distribution: { IT_ENGINEERING: 1 } },
    };
    expect(computeRowVariants(row, CONFIG).noTextSignal).toBe(true);
  });

  it("키워드·임베딩이 둘 다 없으면 noTextSignal이 true이고 B/C/D 모두 TM 단독 판정과 같다", () => {
    const row: ComparisonRow = {
      id: "c.png",
      trueLabel: "IT_ENGINEERING",
      orgName: null,
      tmScores: [{ classId: "IT_ENGINEERING", score: 0.9 }],
      ocrOk: true,
      keyword: null,
      embedding: null,
    };
    const result = computeRowVariants(row, CONFIG);
    expect(result.noTextSignal).toBe(true);
    expect(result.A).toEqual(result.B);
    expect(result.A).toEqual(result.C);
    expect(result.A).toEqual(result.D);
  });
});

describe("computeComparisonReport — 지표 집계(가이드 12장 P5)", () => {
  const rows: ComparisonRow[] = [
    {
      id: "row1.png",
      trueLabel: "IT_ENGINEERING",
      orgName: "Org1",
      tmScores: [
        { classId: "IT_ENGINEERING", score: 0.9 },
        { classId: "DESIGN_MEDIA", score: 0.05 },
      ],
      ocrOk: true,
      keyword: { distribution: { IT_ENGINEERING: 1 }, matchedKeywords: ["해커톤"] },
      embedding: null,
    },
    {
      id: "row2.png",
      trueLabel: "DESIGN_MEDIA",
      orgName: null,
      tmScores: [
        { classId: "IT_ENGINEERING", score: 0.9 },
        { classId: "DESIGN_MEDIA", score: 0.05 },
      ],
      ocrOk: false,
      keyword: null,
      embedding: { distribution: { IT_ENGINEERING: 1 } },
    },
  ];
  const trainOrgNames = ["Org1"];

  it("A(TM만) 정확도·macro-F1을 올바르게 계산한다", () => {
    const report = computeComparisonReport(rows, trainOrgNames, CONFIG);
    // 두 행 모두 TM이 IT_ENGINEERING을 1위로 꼽는다 — row1은 정답, row2는 오답.
    expect(report.variants.A.accuracy).toEqual({ correct: 1, total: 2, accuracy: 0.5 });
    expect(report.variants.A.macroF1).toBeCloseTo((2 / 3 + 0) / 2, 4);
    expect(report.variants.A.suggestedRate).toBe(1); // 둘 다 top/margin 기준을 넘어 suggested.
    expect(report.variants.A.accuracyAmongSuggested).toEqual({ correct: 1, total: 2, accuracy: 0.5 });
  });

  it("처음 보는 기관 정확도는 학습 자료에 있던 기관(Org1)을 제외한다", () => {
    const report = computeComparisonReport(rows, trainOrgNames, CONFIG);
    // row1의 기관(Org1)은 학습 자료에 있어 "처음 보는 기관"이 아니고, row2는 기관명이 없어
    // 대상에서 빠진다 — 결국 "처음 보는 기관" 표본이 0건이다.
    expect(report.variants.A.unseenOrgAccuracy).toEqual({ total: 0, accuracy: 0 });
  });

  it("신호별 단독 정확도(참고용)는 결합 없이 그 신호 하나만 봤을 때의 정확도다", () => {
    const report = computeComparisonReport(rows, trainOrgNames, CONFIG);
    // TM: 둘 다 IT_ENGINEERING → row1 정답, row2 오답 → 1/2.
    expect(report.standaloneAccuracy.tm).toEqual({ correct: 1, total: 2, accuracy: 0.5 });
    // 키워드: row1만 있음(IT_ENGINEERING, 정답), row2는 없음(오답 처리) → 1/2.
    expect(report.standaloneAccuracy.keyword).toEqual({ correct: 1, total: 2, accuracy: 0.5 });
    // 임베딩: row1은 없음(오답 처리), row2는 있지만 IT_ENGINEERING으로 틀림(정답은 DESIGN_MEDIA) → 0/2.
    expect(report.standaloneAccuracy.embedding).toEqual({ correct: 0, total: 2, accuracy: 0 });
  });

  it("글자 신호 없음 비율을 계산한다(OCR 실패 또는 키워드·임베딩 둘 다 없음)", () => {
    const report = computeComparisonReport(rows, trainOrgNames, CONFIG);
    // row1은 OCR 성공 + 키워드 있음 → 글자 신호 있음. row2는 OCR 실패 → 글자 신호 없음.
    expect(report.noTextSignalRate).toBe(0.5);
  });

  it("rows에 원본 입력과 A~D 변형 결과를 함께 담아 내보내기(CSV)에 쓸 수 있게 한다", () => {
    const report = computeComparisonReport(rows, trainOrgNames, CONFIG);
    expect(report.total).toBe(2);
    expect(report.rows).toHaveLength(2);
    expect(report.rows[0].variants.matchedKeywords).toEqual(["해커톤"]);
  });

  it("빈 입력이면 모든 방식이 0/0으로 안전하게 계산된다", () => {
    const report = computeComparisonReport([], [], CONFIG);
    expect(report.total).toBe(0);
    expect(report.variants.A.accuracy).toEqual({ correct: 0, total: 0, accuracy: 0 });
    expect(report.noTextSignalRate).toBe(0);
  });
});
