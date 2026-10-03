import type { SupabaseClient } from "@supabase/supabase-js";
import {
  rankActivities,
  scoreActivity,
  type RecommendationActivityInput,
  type RecommendationProfileInput,
  type RecommendationWeights,
  type ScoredActivity,
} from "@/lib/recommend";
import type { ActivityWithType } from "@/lib/supabase/types";

const DEFAULT_WEIGHTS: RecommendationWeights = {
  interest: 35,
  preferred_activity_type: 20,
  major_relevance: 15,
  region_mode: 15,
  duration_time_fit: 15,
};

export async function loadRecommendationWeights(supabase: SupabaseClient): Promise<RecommendationWeights> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "recommendation_weights")
    .maybeSingle();
  if (!data?.value) return DEFAULT_WEIGHTS;
  return { ...DEFAULT_WEIGHTS, ...(data.value as Partial<RecommendationWeights>) };
}

export async function loadRecommendationProfile(
  supabase: SupabaseClient,
  profileId: string
): Promise<RecommendationProfileInput> {
  const [profileRes, interestsRes, typesRes, majorsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("preferred_location_type, preferred_region")
      .eq("id", profileId)
      .single(),
    supabase.from("profile_interests").select("interests(name)").eq("profile_id", profileId),
    supabase.from("profile_preferred_activity_types").select("activity_type_id").eq("profile_id", profileId),
    supabase.from("profile_majors").select("majors(department, name)").eq("profile_id", profileId),
  ]);

  const interestNames = (interestsRes.data ?? [])
    .map((r) => (r as unknown as { interests: { name: string } | null }).interests?.name)
    .filter((v): v is string => Boolean(v));

  const majorKeywords = (majorsRes.data ?? [])
    .flatMap((r) => {
      const major = (r as unknown as { majors: { department: string; name: string } | null }).majors;
      return major ? [major.department, major.name] : [];
    })
    .filter((v): v is string => Boolean(v && v.trim().length > 0));

  return {
    interestNames,
    preferredActivityTypeIds: (typesRes.data ?? []).map((r) => r.activity_type_id),
    majorKeywords,
    preferredLocationType: profileRes.data?.preferred_location_type ?? null,
    preferredRegion: profileRes.data?.preferred_region ?? null,
  };
}

function toRecommendationActivity(activity: ActivityWithType, tags: string[]): RecommendationActivityInput {
  return {
    id: activity.id,
    title: activity.title,
    tags,
    activityTypeId: activity.activity_type_id,
    locationType: activity.location_type,
    region: activity.region,
    applyEndAt: activity.apply_end_at,
    lastVerifiedAt: activity.last_verified_at,
  };
}

export interface RecommendedActivity extends ScoredActivity {
  activity: ActivityWithType;
}

/**
 * 홈 화면 등에 쓰는 "맞춤 추천" 목록. 공개·마감 전·숨기지 않은 활동만 후보로 삼는다.
 */
export async function loadRecommendedActivities(
  supabase: SupabaseClient,
  profileId: string,
  limit = 5
): Promise<RecommendedActivity[]> {
  const nowIso = new Date().toISOString();

  const [profile, weights, feedbackRes, activitiesRes] = await Promise.all([
    loadRecommendationProfile(supabase, profileId),
    loadRecommendationWeights(supabase),
    supabase.from("activity_feedback").select("activity_id").eq("profile_id", profileId),
    supabase
      .from("activities")
      .select("*, activity_types(id, name)")
      .eq("status", "published")
      .or(`apply_end_at.is.null,apply_end_at.gte.${nowIso}`)
      .returns<ActivityWithType[]>(),
  ]);

  const hiddenIds = new Set((feedbackRes.data ?? []).map((r) => r.activity_id));
  const candidates = (activitiesRes.data ?? []).filter((a) => !hiddenIds.has(a.id));
  if (candidates.length === 0) return [];

  const activityIds = candidates.map((a) => a.id);
  const { data: tagRows } = await supabase.from("activity_tags").select("activity_id, tag").in("activity_id", activityIds);
  const tagsByActivity = new Map<string, string[]>();
  for (const row of tagRows ?? []) {
    const list = tagsByActivity.get(row.activity_id) ?? [];
    list.push(row.tag);
    tagsByActivity.set(row.activity_id, list);
  }

  const byId = new Map(candidates.map((a) => [a.id, a]));
  const inputs = candidates.map((a) => toRecommendationActivity(a, tagsByActivity.get(a.id) ?? []));
  const ranked = rankActivities(profile, inputs, weights, { limit });

  return ranked.map((r) => ({ ...r, activity: byId.get(r.activityId)! }));
}

/**
 * 활동 상세 화면의 "추천 근거" 섹션 — 해당 활동 1건에 대한 점수/근거만 계산한다.
 */
export async function loadRecommendationForActivity(
  supabase: SupabaseClient,
  profileId: string,
  activity: ActivityWithType,
  tags: string[]
): Promise<ScoredActivity> {
  const [profile, weights] = await Promise.all([
    loadRecommendationProfile(supabase, profileId),
    loadRecommendationWeights(supabase),
  ]);
  return scoreActivity(profile, toRecommendationActivity(activity, tags), weights);
}
