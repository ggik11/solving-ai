/**
 * 포스터 분류 판정 규칙(가이드 5.5)과 모델 클래스 -> 서비스 분야 후보 해석(가이드 3.6).
 * 순수 함수만 모아 모델 없이도 단위 테스트할 수 있게 한다.
 */

export type PosterAnalysisStatus = "suggested" | "needs_review" | "failed";
export type PosterFailureReason =
  | "model_missing"
  | "model_load_error"
  | "image_decode_error"
  | "class_map_mismatch";

export interface ClassScore {
  classId: string;
  score: number;
}

export interface PosterClassifierConfig {
  enabled: boolean;
  suggestMinTopScore: number;
  suggestMinMargin: number;
  modelPath: string;
}

export const DEFAULT_POSTER_CLASSIFIER_CONFIG: PosterClassifierConfig = {
  enabled: true,
  suggestMinTopScore: 0.8,
  suggestMinMargin: 0.2,
  modelPath: "/models/poster-classifier/",
};

export interface PosterJudgment {
  status: PosterAnalysisStatus;
  topClass: string | null;
  topScore: number | null;
  margin: number | null;
}

/**
 * 가이드 5.5: p1 >= suggest_min_top_score 그리고 p1 - p2 >= suggest_min_margin이면 suggested,
 * 그 외는 needs_review. 점수가 비어 있으면(예측 자체가 없음) 호출부가 failed로 처리해야 한다 —
 * 이 함수는 "예측은 있었다"를 전제한다.
 */
export function judgePosterClassification(scores: ClassScore[], config: PosterClassifierConfig): PosterJudgment {
  if (scores.length === 0) {
    throw new Error("scores가 비어 있습니다 — 예측 실패는 이 함수를 호출하기 전에 failed로 처리해야 합니다.");
  }
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  const [first, second] = sorted;
  const margin = first.score - (second?.score ?? 0);
  const suggested = first.score >= config.suggestMinTopScore && margin >= config.suggestMinMargin;
  return {
    status: suggested ? "suggested" : "needs_review",
    topClass: first.classId,
    topScore: first.score,
    margin,
  };
}

export interface ModelClassFieldMapRow {
  modelVersion: string;
  classId: string;
  /** null이면 "서비스 분야 없음"을 의도적으로 표시한 클래스다(가이드 3.6 보완, 예: 교내 행정
   * 공지 CAMPUS_NOTICE) — "아직 매핑을 못 채운 버그"와 구분한다. */
  interestId: string | null;
}

/**
 * 1위 클래스를 서비스 분야 후보로 바꾼다(가이드 3.6). 한 클래스가 여러 후보로 연결될 수 있다.
 * 매핑이 없는 모델 버전/클래스거나 "서비스 분야 없음"으로 표시된 클래스(interestId null)면
 * 빈 배열을 반환한다 — 호출부가 "연결표 없음" 경고나 "분야 없음" 안내로 표시한다.
 */
export function resolveCandidateInterestIds(
  classId: string,
  modelVersion: string,
  map: ModelClassFieldMapRow[]
): string[] {
  return map
    .filter((m) => m.modelVersion === modelVersion && m.classId === classId && m.interestId !== null)
    .map((m) => m.interestId as string);
}

/** metadata.json의 labels가 연결표의 class_id와 하나라도 겹치지 않으면 "연결표 없음"으로 본다. */
export function hasClassFieldMapFor(modelVersion: string, labels: string[], map: ModelClassFieldMapRow[]): boolean {
  return labels.some((label) => map.some((m) => m.modelVersion === modelVersion && m.classId === label));
}

/**
 * 이 클래스가 "서비스 분야 없음"으로 명시적으로 연결됐는지(가이드 3.6 보완, 예: CAMPUS_NOTICE).
 * true면 1위로 나와도 분야를 제안하지 않고 needs_review로 둬야 한다(analyzePoster가 적용).
 */
export function classHasNoServiceField(classId: string, modelVersion: string, map: ModelClassFieldMapRow[]): boolean {
  return map.some((m) => m.modelVersion === modelVersion && m.classId === classId && m.interestId === null);
}
