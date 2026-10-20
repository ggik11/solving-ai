/**
 * 포스터 2차 후처리 결합·합의 규칙(가이드 12장, postprocess-v1). TM(이미지)·키워드(2-A)·
 * 임베딩(2-B) 세 신호를 가중합해 최종 분야 순위를 만들고, 자동 제안(suggested) 여부를
 * 정한다. 순수 함수다 — OCR·임베딩 호출은 호출부(PosterClassifierPanel)가 먼저 하고, 그
 * 결과(KeywordClassification/EmbeddingClassification)만 여기 넘긴다.
 */
import { judgePosterClassification, type ClassScore, type PosterClassifierConfig } from "./classifier";
import type { KeywordClassification } from "./keywordRules";
import type { EmbeddingClassification } from "./embeddingClassifier";

export const POSTPROCESS_VERSION = "postprocess-v1";

/** 가중치(가이드 12장, 코드 상수로 고정 — test 사진을 보기 전에 고정한 값이다). 없는 신호는
 * 빼고 남은 가중치를 합 1로 다시 맞춘다. */
const SIGNAL_WEIGHTS = { tm: 0.3, keyword: 0.35, embedding: 0.35 } as const;
const SUGGESTED_MIN_SCORE = 0.5;
const MIN_AGREEING_SIGNALS = 2;
/** 서비스 분야가 없는 클래스(가이드 3.6 보완) — 최종 1위면 점수와 무관하게 분야를 제안하지 않는다. */
const NO_SERVICE_FIELD_CLASS_ID = "CAMPUS_NOTICE";

export interface RankedClass {
  classId: string;
  score: number;
}

export interface CombineResult {
  status: "suggested" | "needs_review";
  /** 최종 1위 classId(= finalRanking[0]?.classId). 예측값 자체가 없으면 null. */
  finalTopClass: string | null;
  finalTopScore: number | null;
  /** 최종 순위 상위 3개(화면 표시용) — usedFallback이면 TM 분포 기준. */
  finalRanking: RankedClass[];
  tmTopClass: string | null;
  keywordTopClass: string | null;
  embedTopClass: string | null;
  /** 최종 1위와 일치하는 신호 개수(존재하는 신호만 센다). usedFallback이면 TM 하나뿐이라 1. */
  signalAgreement: number;
  /** 근거로 걸린 키워드(중복 제거) — keyword 신호가 없으면 빈 배열. */
  matchedKeywords: string[];
  /** 글자 신호(키워드·임베딩)가 하나도 없어 기존 TM 단독 판정(0.80/0.20)을 그대로 썼는지. */
  usedFallback: boolean;
}

function topOf(distribution: Record<string, number> | null): string | null {
  if (!distribution) return null;
  let best: string | null = null;
  let bestScore = -Infinity;
  for (const [classId, score] of Object.entries(distribution)) {
    if (score > bestScore) {
      bestScore = score;
      best = classId;
    }
  }
  return best;
}

function rankingOf(distribution: Record<string, number>, limit = 3): RankedClass[] {
  return Object.entries(distribution)
    .map(([classId, score]) => ({ classId, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * TM 점수와(있으면) 키워드·임베딩 분류 결과를 결합한다.
 * - 글자 신호(키워드·임베딩)가 둘 다 없으면 기존 TM 단독 판정(`judgePosterClassification`,
 *   0.80/0.20)을 그대로 쓴다.
 * - 그 외에는 있는 신호(TM 항상 포함 + 키워드·임베딩 중 있는 것)를 가중치 재정규화해 합치고,
 *   최종 1위가 `CAMPUS_NOTICE`면 무조건 needs_review, 아니면 "있는 신호 중 2개 이상의 1위가
 *   최종 1위와 같고 최종 1위 점수가 0.50 이상"일 때만 suggested로 둔다.
 */
export function combinePosterSignals(args: {
  tmScores: ClassScore[];
  keyword: KeywordClassification | null;
  embedding: EmbeddingClassification | null;
  config: PosterClassifierConfig;
}): CombineResult {
  const { tmScores, keyword, embedding, config } = args;

  const tmDistribution: Record<string, number> = {};
  for (const s of tmScores) tmDistribution[s.classId] = s.score;
  const tmTopClass = topOf(tmDistribution);
  const keywordTopClass = keyword ? topOf(keyword.distribution) : null;
  const embedTopClass = embedding ? topOf(embedding.distribution) : null;
  const matchedKeywords = keyword?.matchedKeywords ?? [];

  if (!keyword && !embedding) {
    const judgment = judgePosterClassification(tmScores, config);
    // judgePosterClassification은 scores가 비면 예외를 던지므로(호출부가 failed로 처리) 실제로는
    // "suggested" | "needs_review"만 돌려준다 — PosterAnalysisStatus 타입에만 "failed"가 남아 있다.
    return {
      status: judgment.status === "suggested" ? "suggested" : "needs_review",
      finalTopClass: judgment.topClass,
      finalTopScore: judgment.topScore,
      finalRanking: rankingOf(tmDistribution),
      tmTopClass,
      keywordTopClass: null,
      embedTopClass: null,
      signalAgreement: judgment.topClass != null ? 1 : 0,
      matchedKeywords: [],
      usedFallback: true,
    };
  }

  const signals: { weight: number; distribution: Record<string, number> }[] = [
    { weight: SIGNAL_WEIGHTS.tm, distribution: tmDistribution },
  ];
  if (keyword) signals.push({ weight: SIGNAL_WEIGHTS.keyword, distribution: keyword.distribution });
  if (embedding) signals.push({ weight: SIGNAL_WEIGHTS.embedding, distribution: embedding.distribution });

  const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
  const combined: Record<string, number> = {};
  for (const { weight, distribution } of signals) {
    const normalizedWeight = weight / totalWeight;
    for (const [classId, score] of Object.entries(distribution)) {
      combined[classId] = (combined[classId] ?? 0) + normalizedWeight * score;
    }
  }

  const finalRanking = rankingOf(combined);
  const finalTopClass = finalRanking[0]?.classId ?? null;
  const finalTopScore = finalRanking[0]?.score ?? null;

  const presentTops = [tmTopClass, keywordTopClass, embedTopClass].filter((c): c is string => c != null);
  const signalAgreement = presentTops.filter((c) => c === finalTopClass).length;

  let status: "suggested" | "needs_review";
  if (finalTopClass === NO_SERVICE_FIELD_CLASS_ID) {
    status = "needs_review";
  } else if (signalAgreement >= MIN_AGREEING_SIGNALS && (finalTopScore ?? 0) >= SUGGESTED_MIN_SCORE) {
    status = "suggested";
  } else {
    status = "needs_review";
  }

  return {
    status,
    finalTopClass,
    finalTopScore,
    finalRanking,
    tmTopClass,
    keywordTopClass,
    embedTopClass,
    signalAgreement,
    matchedKeywords,
    usedFallback: false,
  };
}
