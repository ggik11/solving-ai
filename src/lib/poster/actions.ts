"use server";

import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/errors";
import type { ClassScore, ModelClassFieldMapRow, PosterAnalysisStatus, PosterFailureReason } from "./classifier";
import type { CachedPosterAnalysis } from "./analyze";
import { loadModelClassFieldMap } from "./query";

interface PosterAnalysisRow {
  scores: ClassScore[];
  status: PosterAnalysisStatus;
  top_class: string | null;
  top_score: number | null;
  margin: number | null;
  failure_reason: PosterFailureReason | null;
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
}): Promise<{ ok: true; analysisId: string } | { ok: false; error: string }> {
  const supabase = await createClient();
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
  });
  if (error || !data) return { ok: false, error: friendlyError(error, "분석 결과 저장에 실패했습니다.") };
  return { ok: true, analysisId: data as string };
}

export async function lookupModelClassFieldMapAction(modelVersion: string): Promise<ModelClassFieldMapRow[]> {
  const supabase = await createClient();
  return loadModelClassFieldMap(supabase, modelVersion);
}
