/**
 * 포스터 분석 오케스트레이션(가이드 5.4 2~4번). 모델 로딩/캔버스 드로잉처럼 브라우저 전용인
 * 부분은 의존성으로 주입받아, 이 함수 자체는 모델 없이도(목을 주입해) 단위 테스트할 수 있다.
 */
import {
  classHasNoServiceField,
  hasClassFieldMapFor,
  judgePosterClassification,
  resolveCandidateInterestIds,
  type ClassScore,
  type ModelClassFieldMapRow,
  type PosterAnalysisStatus,
  type PosterClassifierConfig,
  type PosterFailureReason,
} from "./classifier";
import type { LoadedPosterModel } from "./modelLoader";

export interface CachedPosterAnalysis {
  scores: ClassScore[];
  status: PosterAnalysisStatus;
  topClass: string | null;
  topScore: number | null;
  margin: number | null;
  failureReason: PosterFailureReason | null;
}

export interface PosterAnalysisResult extends CachedPosterAnalysis {
  posterHash: string;
  modelVersion: string;
  preprocessingVersion: string;
  /** 1위 클래스를 연결표로 바꾼 서비스 분야 후보(가이드 3.6). 여러 개일 수 있다. */
  candidateInterestIds: string[];
  /** 이 모델 버전의 클래스에 연결표가 하나도 없음 — "연결표 없음" 경고용(가이드 3.6). */
  classFieldMapMissing: boolean;
  /** topClass가 "서비스 분야 없음"으로 명시된 클래스인지(가이드 3.6 보완, 예: CAMPUS_NOTICE) —
   * true면 status는 이미 needs_review로 내려가 있고 candidateInterestIds는 비어 있다. */
  noServiceFieldClass: boolean;
  /** 같은 (활동, 해시, 모델, 전처리) 분석을 재사용했는지(가이드 3.5) — 다시 예측하지 않았다. */
  fromCache: boolean;
}

export interface FindCachedArgs {
  activityId: string | null;
  posterHash: string;
  modelVersion: string;
  preprocessingVersion: string;
}

export interface AnalyzePosterDeps {
  activityId: string | null;
  posterHash: string;
  preprocessingVersion: string;
  model: LoadedPosterModel;
  canvas: HTMLCanvasElement;
  config: PosterClassifierConfig;
  classFieldMap: ModelClassFieldMapRow[];
  findCached: (args: FindCachedArgs) => Promise<CachedPosterAnalysis | null>;
}

export async function analyzePoster(deps: AnalyzePosterDeps): Promise<PosterAnalysisResult> {
  const { model, posterHash, preprocessingVersion, config, classFieldMap, findCached, activityId, canvas } = deps;
  const classFieldMapMissing = !hasClassFieldMapFor(model.modelVersion, model.labels, classFieldMap);

  const cached = await findCached({ activityId, posterHash, modelVersion: model.modelVersion, preprocessingVersion });
  if (cached) {
    const candidateInterestIds = cached.topClass
      ? resolveCandidateInterestIds(cached.topClass, model.modelVersion, classFieldMap)
      : [];
    const noServiceFieldClass = cached.topClass
      ? classHasNoServiceField(cached.topClass, model.modelVersion, classFieldMap)
      : false;
    return {
      ...cached,
      posterHash,
      modelVersion: model.modelVersion,
      preprocessingVersion,
      candidateInterestIds,
      classFieldMapMissing,
      noServiceFieldClass,
      fromCache: true,
    };
  }

  const scores = await model.predict(canvas);
  const judgment = judgePosterClassification(scores, config);
  const noServiceFieldClass = judgment.topClass
    ? classHasNoServiceField(judgment.topClass, model.modelVersion, classFieldMap)
    : false;
  // CAMPUS_NOTICE처럼 "서비스 분야 없음"으로 명시된 클래스는 점수가 임계값을 넘어도 분야를
  // 제안하지 않는다 — suggested로 올리지 않고 needs_review로 둔다(가이드 3.6 보완).
  const status: PosterAnalysisStatus = noServiceFieldClass ? "needs_review" : judgment.status;
  const candidateInterestIds = judgment.topClass
    ? resolveCandidateInterestIds(judgment.topClass, model.modelVersion, classFieldMap)
    : [];

  return {
    scores,
    status,
    topClass: judgment.topClass,
    topScore: judgment.topScore,
    margin: judgment.margin,
    failureReason: null,
    posterHash,
    modelVersion: model.modelVersion,
    preprocessingVersion,
    candidateInterestIds,
    classFieldMapMissing,
    noServiceFieldClass,
    fromCache: false,
  };
}

/** 모델 로딩·이미지 디코드 자체가 실패했을 때(analyzePoster를 호출하기 전) 쓰는 결과 모양. */
export function buildFailedAnalysisResult(args: {
  posterHash: string;
  modelVersion: string;
  preprocessingVersion: string;
  failureReason: PosterFailureReason;
}): PosterAnalysisResult {
  return {
    scores: [],
    status: "failed",
    topClass: null,
    topScore: null,
    margin: null,
    failureReason: args.failureReason,
    posterHash: args.posterHash,
    modelVersion: args.modelVersion,
    preprocessingVersion: args.preprocessingVersion,
    candidateInterestIds: [],
    classFieldMapMissing: false,
    noServiceFieldClass: false,
    fromCache: false,
  };
}

/**
 * PosterAnalysisResult 중 DB 함수(create_activity_with_fields/submit_activity)가 받는 부분만.
 * "preview" 모드(활동이 아직 없음)에서 PosterClassifierPanel의 onAnalyzed가 올리고, 상위 폼이
 * 최종 저장 때까지 들고 있다가 그대로 전달한다(가이드 5.4 5번).
 */
export interface PendingPosterAnalysis {
  posterHash: string;
  modelVersion: string;
  preprocessingVersion: string;
  scores: ClassScore[];
  topClass: string | null;
  topScore: number | null;
  margin: number | null;
  status: PosterAnalysisStatus;
  failureReason: PosterFailureReason | null;
}

export function toPendingPosterAnalysis(result: PosterAnalysisResult): PendingPosterAnalysis {
  return {
    posterHash: result.posterHash,
    modelVersion: result.modelVersion,
    preprocessingVersion: result.preprocessingVersion,
    scores: result.scores,
    topClass: result.topClass,
    topScore: result.topScore,
    margin: result.margin,
    status: result.status,
    failureReason: result.failureReason,
  };
}

export { DEFAULT_POSTER_CLASSIFIER_CONFIG } from "./classifier";
export type { PosterClassifierConfig };
