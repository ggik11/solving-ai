"use server";

import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/errors";
import type { ClassScore, ModelClassFieldMapRow, PosterAnalysisStatus, PosterFailureReason } from "./classifier";
import type { CachedPosterAnalysis, PosterPostprocessInfo } from "./analyze";
import { loadModelClassFieldMap } from "./query";

interface PosterAnalysisRow {
  scores: ClassScore[];
  status: PosterAnalysisStatus;
  top_class: string | null;
  top_score: number | null;
  margin: number | null;
  failure_reason: PosterFailureReason | null;
  postprocess_version: string | null;
  keywords_version: string | null;
  embed_version: string | null;
  tm_top_class: string | null;
  keyword_top_class: string | null;
  embed_top_class: string | null;
  final_top_class: string | null;
  signal_agreement: number | null;
  matched_keywords: string[] | null;
}

function toPostprocessInfo(row: PosterAnalysisRow): PosterPostprocessInfo | undefined {
  if (!row.postprocess_version) return undefined;
  return {
    postprocessVersion: row.postprocess_version,
    keywordsVersion: row.keywords_version,
    embedVersion: row.embed_version,
    tmTopClass: row.tm_top_class,
    keywordTopClass: row.keyword_top_class,
    embedTopClass: row.embed_top_class,
    finalTopClass: row.final_top_class,
    signalAgreement: row.signal_agreement,
    matchedKeywords: row.matched_keywords ?? [],
    // 전체 순위는 DB에 저장하지 않는다(가이드 12장 — final_top_class만 저장) — 캐시된 분석을
    // 다시 불러올 때는 순위 표시를 생략한다.
    finalRanking: [],
  };
}

/** 같은 (활동, 해시, 모델, 전처리) 분석이 이미 있으면 재사용한다(가이드 3.5) — 모델을 다시 돌리지 않는다. */
export async function findCachedPosterAnalysisAction(args: {
  activityId: string | null;
  posterHash: string;
  modelVersion: string;
  preprocessingVersion: string;
}): Promise<CachedPosterAnalysis | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("find_cached_poster_analysis", {
      p_activity_id: args.activityId,
      p_poster_hash: args.posterHash,
      p_model_version: args.modelVersion,
      p_preprocessing_version: args.preprocessingVersion,
    })
    .maybeSingle<PosterAnalysisRow>();
  if (error || !data) return null;
  return {
    scores: data.scores,
    status: data.status,
    topClass: data.top_class,
    topScore: data.top_score,
    margin: data.margin,
    failureReason: data.failure_reason,
    postprocess: toPostprocessInfo(data),
  };
}

export async function recordPosterAnalysisAction(args: {
  activityId: string;
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
}): Promise<{ ok: true; analysisId: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const pp = args.postprocess;
  const { data, error } = await supabase.rpc("record_poster_analysis", {
    p_activity_id: args.activityId,
    p_poster_hash: args.posterHash,
    p_model_version: args.modelVersion,
    p_preprocessing_version: args.preprocessingVersion,
    p_scores: args.scores,
    p_top_class: args.topClass,
    p_top_score: args.topScore,
    p_margin: args.margin,
    p_status: args.status,
    p_failure_reason: args.failureReason,
    p_postprocess_version: pp?.postprocessVersion ?? null,
    p_keywords_version: pp?.keywordsVersion ?? null,
    p_embed_version: pp?.embedVersion ?? null,
    p_tm_top_class: pp?.tmTopClass ?? null,
    p_keyword_top_class: pp?.keywordTopClass ?? null,
    p_embed_top_class: pp?.embedTopClass ?? null,
    p_final_top_class: pp?.finalTopClass ?? null,
    p_signal_agreement: pp?.signalAgreement ?? null,
    p_matched_keywords: pp?.matchedKeywords ?? null,
  });
  if (error || !data) return { ok: false, error: friendlyError(error, "분석 결과 저장에 실패했습니다.") };
  return { ok: true, analysisId: data as string };
}

export async function lookupModelClassFieldMapAction(modelVersion: string): Promise<ModelClassFieldMapRow[]> {
  const supabase = await createClient();
  return loadModelClassFieldMap(supabase, modelVersion);
}

export interface OrgFieldHistoryItem {
  interestId: string;
  count: number;
}

/** 같은 주최 기관의 활동 중 이미 확정된 분야(참고용, 가이드 12장 5번) — 점수 계산에는 쓰지 않는다.
 * 운영자가 아니거나 기관명이 비어 있으면 빈 배열(화면은 "참고 정보 생략"으로 다룬다). */
export async function lookupOrgFieldHistoryAction(orgName: string): Promise<OrgFieldHistoryItem[]> {
  const trimmed = orgName.trim();
  if (!trimmed) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lookup_org_field_history", { p_org_name: trimmed });
  if (error || !data) return [];
  return (data as { interest_id: string; field_count: number }[]).map((r) => ({ interestId: r.interest_id, count: r.field_count }));
}
