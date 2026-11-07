import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  baselineComparison,
  CLASS_ORDER,
  confusionGrid,
  judgmentReason,
  normalizeDrops,
  occlusionPatches,
  topPatches,
  mcnemarFromRows,
  noKeywordCount,
  parseCsv,
  sameCoreMetrics,
  seenVsUnseen,
  splitCounts,
  sweepCurve,
  topConfusions,
  wilsonInterval,
} from "../../docs/tm-demo/metrics.js";

const EXP = path.resolve(__dirname, "../../docs/experiments/2026-10-21-poster-pilot");
const readJson = (name: string) => JSON.parse(readFileSync(path.join(EXP, name), "utf8"));
const readText = (name: string) => readFileSync(path.join(EXP, name), "utf8");

const evaluation = readJson("tm-only-eval-1st.json");
const rerun = readJson("tm-only-eval-rerun.json");
const comparison = readJson("postprocess-comparison.json");
const comparisonRows = parseCsv(readText("postprocess-comparison.csv"));
const manifestRows = parseCsv(readText("manifest.csv"));

describe("docs/tm-demo/metrics.js — 보고서 지표 계산", () => {
  it("CSV 파서가 BOM, 따옴표 안 쉼표, 따옴표 이스케이프를 처리한다", () => {
    const rows = parseCsv('﻿a,b,c\n1,"x, y","say ""hi"""\r\n2,,z\n');
    expect(rows).toEqual([
      { a: "1", b: "x, y", c: 'say "hi"' },
      { a: "2", b: "", c: "z" },
    ]);
  });

  it("manifest에서 분야별 train/test 개수를 실험 README와 같게 계산한다", () => {
    const counts = splitCounts(manifestRows);
    expect(counts.train).toBe(144);
    expect(counts.test).toBe(35);
    expect(counts.ood).toBe(1);
    expect(counts.total).toBe(180);
    const byId = Object.fromEntries(counts.perClass.map((c) => [c.classId, [c.train, c.test]]));
    expect(byId).toEqual({
      IT_ENGINEERING: [33, 7],
      BUSINESS_PLANNING: [17, 5],
      DESIGN_MEDIA: [30, 8],
      SOCIAL_ENVIRONMENT: [32, 7],
      LAW_POLICY: [6, 2],
      CAMPUS_NOTICE: [6, 2],
      HOBBY_CULTURE: [20, 4],
    });
  });

  it("기준선 비교: 무작위 1/7, 다수 클래스 23%, 모델 31%", () => {
    const rows = baselineComparison(evaluation);
    expect(rows.map((r) => r.key)).toEqual(["random", "majority", "model"]);
    expect(rows[0].rate).toBeCloseTo(1 / 7);
    expect(Math.round(rows[1].rate * 100)).toBe(23);
    expect(Math.round(rows[2].rate * 100)).toBe(31);
  });

  it("혼동행렬 격자의 대각선 합이 정답 수(11)이고 전체 합이 평가 수(35)다", () => {
    const grid = confusionGrid(evaluation.confusionMatrix);
    expect(grid).toHaveLength(CLASS_ORDER.length);
    const diag = grid.reduce((s, row, i) => s + row[i], 0);
    const total = grid.flat().reduce((s, v) => s + v, 0);
    expect(diag).toBe(evaluation.accuracy.correct);
    expect(total).toBe(evaluation.accuracy.total);
  });

  it("가장 많이 헷갈린 쌍 1위는 디자인 → 사회·환경 4장이다", () => {
    const [first, ...rest] = topConfusions(evaluation.confusionMatrix, 3);
    expect(first).toMatchObject({ actual: "DESIGN_MEDIA", predicted: "SOCIAL_ENVIRONMENT", count: 4, support: 8 });
    expect(rest).toHaveLength(2);
    for (const p of rest) expect(p.count).toBeLessThanOrEqual(first.count);
  });

  it("처음 보는 기관 24%(5/21), 본 적 있는 기관 43%(6/14)", () => {
    const r = seenVsUnseen(evaluation);
    expect(r.unseen).toMatchObject({ correct: 5, total: 21 });
    expect(r.seen).toMatchObject({ correct: 6, total: 14 });
    expect(Math.round(r.seen.rate * 100)).toBe(43);
  });

  it("임계값 곡선: margin 0.2 기준 4개 점, 0.80에서 통과 12장·정답률 50%", () => {
    const curve = sweepCurve(evaluation.thresholdSweep, 0.2);
    expect(curve.map((p) => p.minTopScore)).toEqual([0.6, 0.7, 0.8, 0.9]);
    const at80 = curve.find((p) => p.minTopScore === 0.8);
    expect(at80).toMatchObject({ passedCount: 12, accuracyAmongPassed: 0.5 });
  });

  it("재실행 결과는 1차와 핵심 지표가 같고, 값이 다르면 다르다고 판정한다", () => {
    expect(sameCoreMetrics(evaluation, rerun)).toBe(true);
    const changed = structuredClone(rerun);
    changed.accuracy.correct = 12;
    expect(sameCoreMetrics(evaluation, changed)).toBe(false);
  });

  it("Wilson 95% 신뢰구간이 실험 README와 같다(11/35 → 19~48%, 25/35 → 55~84%)", () => {
    const a = wilsonInterval(11, 35);
    const d = wilsonInterval(25, 35);
    expect([Math.round(a.low * 100), Math.round(a.high * 100)]).toEqual([19, 48]);
    expect([Math.round(d.low * 100), Math.round(d.high * 100)]).toEqual([55, 84]);
  });

  it("McNemar: A에서 틀리고 D에서 맞힌 14장, 반대 0장, p ≈ 0.0001", () => {
    const mc = mcnemarFromRows(comparisonRows);
    expect(mc.aWrongBRight).toBe(14);
    expect(mc.aRightBWrong).toBe(0);
    expect(mc.p).toBeCloseTo(2 / 2 ** 14, 10);
  });

  it("키워드가 하나도 걸리지 않은 포스터는 6장이다", () => {
    expect(noKeywordCount(comparisonRows)).toBe(6);
  });

  it("보완 결과 파일의 방식 A는 1차 평가와 같은 정확도다", () => {
    expect(comparison.variants.A.accuracy.correct).toBe(evaluation.accuracy.correct);
    expect(comparison.variants.D.accuracy.correct).toBe(25);
  });

  it("판정 이유 문장이 세 경우를 구분한다", () => {
    const base = { topClass: "IT_ENGINEERING", secondClass: "DESIGN_MEDIA" };
    expect(judgmentReason({ ...base, topScore: 0.9, margin: 0.5 }, 0.8, 0.2)).toContain("자동 제안합니다");
    expect(judgmentReason({ ...base, topScore: 0.6, margin: 0.4 }, 0.8, 0.2)).toContain("0.60가 기준 0.80보다 낮아");
    expect(judgmentReason({ ...base, topScore: 0.85, margin: 0.1 }, 0.8, 0.2)).toContain("차이 0.10가 기준 0.20보다 작아");
  });

  it("가림 실험 격자는 224px를 7×7=49칸으로 빈틈없이 덮는다", () => {
    const patches = occlusionPatches(224, 7);
    expect(patches).toHaveLength(49);
    const area = patches.reduce((s, p) => s + p.w * p.h, 0);
    expect(area).toBe(224 * 224);
    expect(patches.at(-1)).toMatchObject({ row: 6, col: 6, x: 192, y: 192, w: 32, h: 32 });
    const odd = occlusionPatches(100, 3);
    expect(odd.reduce((s, p) => s + p.w * p.h, 0)).toBe(100 * 100);
  });

  it("점수 하락을 0~1로 정규화하고 오른 칸은 0으로 둔다", () => {
    expect(normalizeDrops([0.2, -0.1, 0.1, 0])).toEqual([1, 0, 0.5, 0]);
    expect(normalizeDrops([-0.1, 0])).toEqual([0, 0]);
  });

  it("가장 중요한 칸을 하락이 큰 순으로 고른다", () => {
    const patches = occlusionPatches(224, 7);
    const drops = patches.map((_, i) => (i === 24 ? 0.3 : i === 3 ? 0.1 : -0.01));
    const top = topPatches(patches, drops, 2);
    expect(top.map((p) => [p.row, p.col])).toEqual([
      [3, 3],
      [0, 3],
    ]);
  });
});
