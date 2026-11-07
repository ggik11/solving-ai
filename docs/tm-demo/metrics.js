/**
 * 보고서 섹션에 쓰는 지표 계산 함수(순수 함수, DOM 없음).
 * 숫자는 모두 docs/experiments/2026-10-21-poster-pilot/의 원본 파일에서 계산한다 —
 * 페이지에 지표를 직접 타이핑하지 않기 위해서다.
 */

export const CLASS_ORDER = [
  "IT_ENGINEERING",
  "BUSINESS_PLANNING",
  "DESIGN_MEDIA",
  "SOCIAL_ENVIRONMENT",
  "LAW_POLICY",
  "CAMPUS_NOTICE",
  "HOBBY_CULTURE",
];

/** 따옴표·쉼표를 처리하는 최소 CSV 파서. 첫 줄은 헤더, BOM은 무시한다. */
export function parseCsv(text) {
  const src = text.replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const nonEmpty = rows.filter((r) => r.some((c) => c !== ""));
  if (nonEmpty.length === 0) return [];
  const [header, ...body] = nonEmpty;
  return body.map((r) => Object.fromEntries(header.map((h, idx) => [h.trim(), (r[idx] ?? "").trim()])));
}

/** manifest 행 → 분야별 train/test 개수와 OOD 개수. */
export function splitCounts(manifestRows, classOrder = CLASS_ORDER) {
  const perClass = classOrder.map((classId) => ({ classId, train: 0, test: 0 }));
  const byId = Object.fromEntries(perClass.map((c) => [c.classId, c]));
  let ood = 0;
  for (const r of manifestRows) {
    if (r.split === "ood" || r.label === "OOD") {
      ood += 1;
      continue;
    }
    const entry = byId[r.label];
    if (!entry) continue;
    if (r.split === "train") entry.train += 1;
    else if (r.split === "test") entry.test += 1;
  }
  const train = perClass.reduce((s, c) => s + c.train, 0);
  const test = perClass.reduce((s, c) => s + c.test, 0);
  return { perClass, train, test, ood, total: train + test + ood };
}

/** 정확도와 두 기준선(무작위, 다수 클래스) 비교. */
export function baselineComparison(evaluation, classCount = CLASS_ORDER.length) {
  return [
    { key: "random", label: `무작위로 고르기 (1/${classCount})`, rate: 1 / classCount },
    {
      key: "majority",
      label: "가장 많은 분야로 모두 찍기",
      rate: evaluation.majorityBaseline.accuracy,
    },
    { key: "model", label: "Teachable Machine 모델", rate: evaluation.accuracy.accuracy },
  ];
}

/** 혼동행렬을 classOrder 순서의 2차원 배열로(행 = 실제, 열 = 예측). */
export function confusionGrid(confusionMatrix, classOrder = CLASS_ORDER) {
  const m = confusionMatrix.matrix;
  return classOrder.map((actual) => classOrder.map((predicted) => (m[actual] && m[actual][predicted]) || 0));
}

/** 대각선을 뺀 혼동 쌍을 많은 순으로 k개. */
export function topConfusions(confusionMatrix, k = 3, classOrder = CLASS_ORDER) {
  const pairs = [];
  for (const actual of classOrder) {
    const row = confusionMatrix.matrix[actual] || {};
    const support = Object.values(row).reduce((s, v) => s + v, 0);
    for (const predicted of classOrder) {
      if (predicted === actual) continue;
      const count = row[predicted] || 0;
      if (count > 0) pairs.push({ actual, predicted, count, support });
    }
  }
  pairs.sort((a, b) => b.count - a.count || b.count / b.support - a.count / a.support);
  return pairs.slice(0, k);
}

/** 처음 보는 기관과 본 적 있는(학습에 같은 기관이 있던) 기관의 정확도. */
export function seenVsUnseen(evaluation) {
  const total = evaluation.accuracy.total;
  const correct = evaluation.accuracy.correct;
  const unseenTotal = evaluation.unseenOrgAccuracy.total;
  const unseenCorrect = Math.round(evaluation.unseenOrgAccuracy.accuracy * unseenTotal);
  const seenTotal = total - unseenTotal;
  const seenCorrect = correct - unseenCorrect;
  return {
    unseen: { correct: unseenCorrect, total: unseenTotal, rate: unseenTotal ? unseenCorrect / unseenTotal : 0 },
    seen: { correct: seenCorrect, total: seenTotal, rate: seenTotal ? seenCorrect / seenTotal : 0 },
  };
}

/** 임계값 실험 결과에서 margin 하나를 고정한 곡선(1위 점수 기준이 오를수록). */
export function sweepCurve(thresholdSweep, minMargin = 0.2) {
  return thresholdSweep
    .filter((p) => Math.abs(p.minMargin - minMargin) < 1e-9)
    .sort((a, b) => a.minTopScore - b.minTopScore)
    .map((p) => ({
      minTopScore: p.minTopScore,
      passRate: p.passRate,
      accuracyAmongPassed: p.accuracyAmongPassed,
      passedCount: p.passedCount,
    }));
}

/** 두 평가 결과의 핵심 지표가 같은지(재현성). */
export function sameCoreMetrics(a, b) {
  const keyOf = (e) =>
    JSON.stringify([
      e.modelVersion,
      e.accuracy.correct,
      e.accuracy.total,
      Number(e.macroF1.toFixed(6)),
      e.classMetrics.map((c) => [c.classId, c.support, Number(c.f1.toFixed(6))]),
      e.confusionMatrix.matrix,
    ]);
  return keyOf(a) === keyOf(b);
}

/** Wilson 95% 신뢰구간. */
export function wilsonInterval(correct, total, z = 1.96) {
  if (total === 0) return { low: 0, high: 0 };
  const p = correct / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))) / denom;
  return { low: Math.max(0, center - half), high: Math.min(1, center + half) };
}

/**
 * 이미지별 비교 CSV에서 방식 A(TM만)와 D(최종)의 엇갈린 쌍과 McNemar 정확 검정(양측) p값.
 */
export function mcnemarFromRows(rows, colA = "final_top_A", colB = "final_top_D") {
  let aWrongBRight = 0;
  let aRightBWrong = 0;
  for (const r of rows) {
    const aOk = r[colA] === r.label;
    const bOk = r[colB] === r.label;
    if (!aOk && bOk) aWrongBRight += 1;
    if (aOk && !bOk) aRightBWrong += 1;
  }
  const n = aWrongBRight + aRightBWrong;
  const k = Math.min(aWrongBRight, aRightBWrong);
  let tail = 0;
  for (let i = 0; i <= k; i += 1) tail += binom(n, i);
  const p = n === 0 ? 1 : Math.min(1, (2 * tail) / 2 ** n);
  return { aWrongBRight, aRightBWrong, p };
}

function binom(n, k) {
  let r = 1;
  for (let i = 1; i <= k; i += 1) r = (r * (n - k + i)) / i;
  return r;
}

/** 키워드가 하나도 걸리지 않은 포스터 수. */
export function noKeywordCount(rows) {
  return rows.filter((r) => !r.keyword_top).length;
}

/** 판정 이유를 문장으로(데모 카드에 표시). */
export function judgmentReason(j, topMin, marginMin) {
  const top = j.topScore.toFixed(2);
  const margin = j.margin.toFixed(2);
  const topOk = j.topScore >= topMin;
  const marginOk = j.margin >= marginMin;
  if (topOk && marginOk) {
    return `1위 점수 ${top}가 기준 ${topMin.toFixed(2)} 이상이고 2위와의 차이 ${margin}도 기준 ${marginMin.toFixed(2)} 이상이라 자동 제안합니다.`;
  }
  if (!topOk) {
    return `1위 점수 ${top}가 기준 ${topMin.toFixed(2)}보다 낮아, 모델이 확신하지 못한 포스터로 보고 관리자 검토로 넘깁니다.`;
  }
  return `1위 점수 ${top}는 충분하지만 2위와의 차이 ${margin}가 기준 ${marginMin.toFixed(2)}보다 작아 관리자 검토로 넘깁니다.`;
}

/**
 * 가림 실험(occlusion) 격자: size×size 이미지를 grid×grid 칸으로 나눈 사각형 목록.
 * 마지막 칸은 나머지 픽셀까지 덮는다.
 */
export function occlusionPatches(size = 224, grid = 7) {
  const step = Math.floor(size / grid);
  const patches = [];
  for (let row = 0; row < grid; row += 1) {
    for (let col = 0; col < grid; col += 1) {
      const x = col * step;
      const y = row * step;
      const w = col === grid - 1 ? size - x : step;
      const h = row === grid - 1 ? size - y : step;
      patches.push({ row, col, x, y, w, h });
    }
  }
  return patches;
}

/**
 * 칸마다 "가렸을 때 1위 점수가 떨어진 양"을 0~1 세기로 바꾼다. 점수가 오른 칸(음수)은 0.
 * 가장 크게 떨어진 칸이 1이 된다. 모두 0 이하이면 전부 0.
 */
export function normalizeDrops(drops) {
  const positive = drops.map((d) => Math.max(0, d));
  const max = Math.max(0, ...positive);
  if (max === 0) return positive.map(() => 0);
  return positive.map((d) => d / max);
}

/** 가장 중요한 칸 k개(떨어진 양이 큰 순). */
export function topPatches(patches, drops, k = 3) {
  return patches
    .map((p, i) => ({ ...p, drop: drops[i] }))
    .filter((p) => p.drop > 0)
    .sort((a, b) => b.drop - a.drop)
    .slice(0, k);
}

export function pct(rate, digits = 0) {
  return `${(rate * 100).toFixed(digits)}%`;
}
