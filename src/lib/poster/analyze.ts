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
import { combinePosterSignals, POSTPROCESS_VERSION, type RankedClass } from "./combine";
import { classifyByKeywords, KEYWORDS_VERSION } from "./keywordRules";
import { classifyByEmbedding, EMBED_VERSION, type EmbeddingReference } from "./embeddingClassifier";

export interface CachedPosterAnalysis {
  scores: ClassScore[];
  status: PosterAnalysisStatus;
  topClass: string | null;
  topScore: number | null;
  margin: number | null;
  failureReason: PosterFailureReason | null;
  /** 캐시된 분석에 2차 후처리 결과가 이미 있으면(가이드 12장) 함께 돌려준다 — 구버전 분석(이
   * 마이그레이션 이전)이면 undefined. */
  postprocess?: PosterPostprocessInfo;
}

/** 포스터 2차 후처리 결합 결과(가이드 12장) — TM만으로 분석한 뒤 applyTextPostprocess()가
 * 채운다. OCR·임베딩을 아직 돌리지 않았으면(또는 TM이 실패했으면) undefined. */
export interface PosterPostprocessInfo {
  postprocessVersion: string;
  /** 키워드 신호가 없었으면(걸린 키워드 없음) null. */
  keywordsVersion: string | null;
  /** 임베딩 신호가 없었으면(참조 세트 없음, 정리 후 텍스트 없음 등) null. */
  embedVersion: string | null;
  tmTopClass: string | null;
  keywordTopClass: string | null;
  embedTopClass: string | null;
  finalTopClass: string | null;
  signalAgreement: number | null;
  matchedKeywords: string[];
  /** 최종 순위 상위 3개(화면 표시 전용 — DB에는 final_top_class만 저장한다). */
  finalRanking: RankedClass[];
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
  /** 가이드 12장 2차 후처리(키워드·임베딩 결합) 결과 — applyTextPostprocess()를 거치기 전에는 없다. */
  postprocess?: PosterPostprocessInfo;
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

/**
 * 포스터 2차 후처리(가이드 12장 P4) — TM 분석 결과에 키워드(2-A)·임베딩(2-B) 신호를 결합해
 * 최종 판정을 다시 내린다. TM이 실패했거나 점수 자체가 없으면 결합할 신호가 없으므로 원본을
 * 그대로 돌려준다. OCR·임베딩 둘 다 실패해도(ocrText가 비거나 embeddingReference가 null) TM
 * 결과로 저장되도록 설계돼 있다 — combinePosterSignals가 글자 신호 없음을 그 자체로 처리한다.
 */
export async function applyTextPostprocess(args: {
  analysis: PosterAnalysisResult;
  ocrText: string;
  title: string;
  description: string;
  embeddingReference: EmbeddingReference | null;
  classFieldMap: ModelClassFieldMapRow[];
  config: PosterClassifierConfig;
}): Promise<PosterAnalysisResult> {
  const { analysis, ocrText, title, description, embeddingReference, classFieldMap, config } = args;
  if (analysis.status === "failed" || analysis.scores.length === 0) return analysis;

  const fullText = [title, description, ocrText]
    .map((s) => s?.trim() ?? "")
    .filter((s) => s.length > 0)
    .join(" ");

  const keyword = classifyByKeywords(fullText);
  const embedding = embeddingReference ? await classifyByEmbedding(fullText, embeddingReference) : null;

  const combined = combinePosterSignals({ tmScores: analysis.scores, keyword, embedding, config });

  const candidateInterestIds = combined.finalTopClass
    ? resolveCandidateInterestIds(combined.finalTopClass, analysis.modelVersion, classFieldMap)
    : [];
  const noServiceFieldClass = combined.finalTopClass
    ? classHasNoServiceField(combined.finalTopClass, analysis.modelVersion, classFieldMap)
    : false;

  return {
    ...analysis,
    status: combined.status,
    topClass: combined.finalTopClass,
    topScore: combined.finalTopScore,
    candidateInterestIds,
    noServiceFieldClass,
    postprocess: {
      postprocessVersion: POSTPROCESS_VERSION,
      keywordsVersion: keyword ? KEYWORDS_VERSION : null,
      embedVersion: embedding ? EMBED_VERSION : null,
      tmTopClass: combined.tmTopClass,
      keywordTopClass: combined.keywordTopClass,
      embedTopClass: combined.embedTopClass,
      finalTopClass: combined.finalTopClass,
      signalAgreement: combined.signalAgreement,
      matchedKeywords: combined.matchedKeywords,
      finalRanking: combined.finalRanking,
    },
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
  postprocess?: PosterPostprocessInfo;
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
    postprocess: result.postprocess,
  };
}

export { DEFAULT_POSTER_CLASSIFIER_CONFIG } from "./classifier";
export type { PosterClassifierConfig };
