import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_POSTER_CLASSIFIER_CONFIG, type ModelClassFieldMapRow, type PosterClassifierConfig } from "./classifier";

interface PosterClassifierSettingValue {
  enabled?: boolean;
  suggest_min_top_score?: number;
  suggest_min_margin?: number;
  model_path?: string;
}

export async function loadPosterClassifierConfig(supabase: SupabaseClient): Promise<PosterClassifierConfig> {
  const { data } = await supabase.from("app_settings").select("value").eq("key", "poster_classifier").maybeSingle();
  const value = (data?.value ?? {}) as PosterClassifierSettingValue;
  return {
    enabled: value.enabled ?? DEFAULT_POSTER_CLASSIFIER_CONFIG.enabled,
    suggestMinTopScore: value.suggest_min_top_score ?? DEFAULT_POSTER_CLASSIFIER_CONFIG.suggestMinTopScore,
    suggestMinMargin: value.suggest_min_margin ?? DEFAULT_POSTER_CLASSIFIER_CONFIG.suggestMinMargin,
    modelPath: value.model_path ?? DEFAULT_POSTER_CLASSIFIER_CONFIG.modelPath,
  };
}

interface ModelClassFieldMapRowDb {
  model_version: string;
  class_id: string;
  interest_id: string;
}

export async function loadModelClassFieldMap(supabase: SupabaseClient, modelVersion: string): Promise<ModelClassFieldMapRow[]> {
  const { data } = await supabase
    .from("model_class_field_map")
    .select("model_version, class_id, interest_id")
    .eq("model_version", modelVersion)
    .returns<ModelClassFieldMapRowDb[]>();
  return (data ?? []).map((row) => ({ modelVersion: row.model_version, classId: row.class_id, interestId: row.interest_id }));
}
