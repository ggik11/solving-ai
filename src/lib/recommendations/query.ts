import type { SupabaseClient } from "@supabase/supabase-js";
import {
  rankActivities,
  scoreActivity,
  DEFAULT_RECOMMENDATION_MODES,
  type ActivityFieldInput,
  type InterestWeightInput,
  type MajorRelevanceInput,
  type MajorStatus,
  type RecommendationActivityInput,
  type RecommendationModesConfig,
  type RecommendationProfileInput,
  type ScoredActivity,
  type UserSelectableRecommendationMode,
} from "@/lib/recommend";
import type { ActivityWithType } from "@/lib/supabase/types";

export async function loadRecommendationModes(supabase: SupabaseClient): Promise<RecommendationModesConfig> {
  const { data } = await supabase.from("app_settings").select("value").eq("key", "recommendation_modes").maybeSingle();
  if (!data?.value) return DEFAULT_RECOMMENDATION_MODES;
  const value = data.value as Record<string, unknown>;
  return {
    balanced: { ...DEFAULT_RECOMMENDATION_MODES.balanced, ...(value.balanced as object) },
    major_focus: { ...DEFAULT_RECOMMENDATION_MODES.major_focus, ...(value.major_focus as object) },
    interest_expand: { ...DEFAULT_RECOMMENDATION_MODES.interest_expand, ...(value.interest_expand as object) },
    no_major: { ...DEFAULT_RECOMMENDATION_MODES.no_major, ...(value.no_major as object) },
  };
}

/**
 * 관심분야 우선순위를 가중치(합 1)로 바꾼다. 우선순위를 매기지 않았으면(모두 priority=null) 균등하게
 * 둔다. 매겼으면 1순위가 n, 꼴찌가 1이 되게 선형으로 내림차순 가중한 뒤 정규화한다(구체적인 변환식은
 * 설계 문서가 정하지 않은 구현 선택 — 우선순위가 낮을수록 반영 비중이 작아지기만 하면 된다).
 */
export function computeInterestWeights(
  rows: { interestId: string; interestName: string; priority: number | null }[]
): InterestWeightInput[] {
  if (rows.length === 0) return [];
  const allUnranked = rows.every((r) => r.priority == null);
  if (allUnranked) {
    const weight = 1 / rows.length;
    return rows.map((r) => ({ interestId: r.interestId, interestName: r.interestName, weight }));
  }
  const sorted = [...rows].sort((a, b) => (a.priority ?? Infinity) - (b.priority ?? Infinity));
  const n = sorted.length;
  const rawWeights = sorted.map((_, i) => n - i);
  const total = rawWeights.reduce((sum, w) => sum + w, 0);
  return sorted.map((r, i) => ({ interestId: r.interestId, interestName: r.interestName, weight: rawWeights[i] / total }));
}

export async function loadRecommendationProfile(
  supabase: SupabaseClient,
  profileId: string
): Promise<RecommendationProfileInput> {
  const [profileRes, interestsRes, typesRes, profileMajorsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("preferred_location_type, preferred_region, major_status, recommendation_mode, weekly_available_hours")
      .eq("id", profileId)
      .single(),
    supabase.from("profile_interests").select("interest_id, priority, interests(name)").eq("profile_id", profileId),
    supabase.from("profile_preferred_activity_types").select("activity_type_id").eq("profile_id", profileId),
    supabase
      .from("profile_majors")
      .select("major_id, majors(name)")
      .eq("profile_id", profileId)
      .eq("use_for_recommendation", true),
  ]);

  const interestRows = (interestsRes.data ?? [])
    .map((r) => {
      const interest = (r as unknown as { interests: { name: string } | null }).interests;
      return interest ? { interestId: r.interest_id, interestName: interest.name, priority: r.priority as number | null } : null;
    })
    .filter((v): v is { interestId: string; interestName: string; priority: number | null } => v !== null);

  const majorStatus = (profileRes.data?.major_status ?? "not_provided") as MajorStatus;
  const majorRows = (profileMajorsRes.data ?? [])
    .map((r) => {
      const major = (r as unknown as { majors: { name: string } | null }).majors;
      return major ? { majorId: r.major_id as string, majorName: major.name } : null;
    })
    .filter((v): v is { majorId: string; majorName: string } => v !== null);

  let majors: MajorRelevanceInput[] = [];
  if (majorStatus === "assigned" && majorRows.length > 0) {
    const majorIds = majorRows.map((m) => m.majorId);
    const { data: weightRows } = await supabase
      .from("major_field_weights")
      .select("major_id, interest_id, weight")
      .in("major_id", majorIds);
    const fieldWeightsByMajor = new Map<string, Record<string, number>>();
    for (const row of weightRows ?? []) {
      const map = fieldWeightsByMajor.get(row.major_id) ?? {};
      map[row.interest_id] = row.weight;
      fieldWeightsByMajor.set(row.major_id, map);
    }
    const q = 1 / majorRows.length;
    majors = majorRows.map((m) => ({
      majorId: m.majorId,
      majorName: m.majorName,
      weight: q,
      fieldWeights: fieldWeightsByMajor.get(m.majorId) ?? {},
    }));
  }

  return {
    interestWeights: computeInterestWeights(interestRows),
    majors,
    majorStatus,
    recommendationMode: (profileRes.data?.recommendation_mode ?? "balanced") as UserSelectableRecommendationMode,
    preferredActivityTypeIds: (typesRes.data ?? []).map((r) => r.activity_type_id),
    preferredLocationType: profileRes.data?.preferred_location_type ?? null,
    preferredRegion: profileRes.data?.preferred_region ?? null,
    weeklyAvailableHours: profileRes.data?.weekly_available_hours ?? null,
  };
}

interface ActivityFieldRow {
  activity_id: string;
  interest_id: string;
  role: "primary" | "secondary";
  interests: { name: string } | null;
}

/** 여러 활동의 activity_fields를 한 번에 불러와 activity_id별로 묶는다. */
export async function loadActivityFieldsByActivity(
  supabase: SupabaseClient,
  activityIds: string[]
): Promise<Map<string, ActivityFieldInput[]>> {
  const byActivity = new Map<string, ActivityFieldInput[]>();
  if (activityIds.length === 0) return byActivity;
  const { data } = await supabase
    .from("activity_fields")
    .select("activity_id, interest_id, role, interests(name)")
    .in("activity_id", activityIds)
    .returns<ActivityFieldRow[]>();
  for (const row of data ?? []) {
    if (!row.interests) continue;
    const list = byActivity.get(row.activity_id) ?? [];
    list.push({ interestId: row.interest_id, interestName: row.interests.name, role: row.role });
    byActivity.set(row.activity_id, list);
  }
  return byActivity;
}

function toRecommendationActivity(activity: ActivityWithType, fields: ActivityFieldInput[]): RecommendationActivityInput {
  return {
    id: activity.id,
    fields,
    activityTypeId: activity.activity_type_id,
    locationType: activity.location_type,
    region: activity.region,
    applyEndAt: activity.apply_end_at,
    lastVerifiedAt: activity.last_verified_at,
    weeklyHours: activity.weekly_hours,
    eligibilityScope: activity.eligibility_scope,
    eligibleMajorIds: activity.eligible_major_ids ?? [],
  };
}

export interface RecommendedActivity extends ScoredActivity {
  activity: ActivityWithType;
}

/**
 * 홈 화면 등에 쓰는 "맞춤 추천" 목록. 공개·마감 전·숨기지 않은·지원 자격이 되는 활동만 후보로 삼는다.
 */
export async function loadRecommendedActivities(
  supabase: SupabaseClient,
  profileId: string,
  limit = 5
): Promise<RecommendedActivity[]> {
  const nowIso = new Date().toISOString();

  const [profile, modes, feedbackRes, activitiesRes] = await Promise.all([
    loadRecommendationProfile(supabase, profileId),
    loadRecommendationModes(supabase),
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
  const fieldsByActivity = await loadActivityFieldsByActivity(supabase, activityIds);

  const byId = new Map(candidates.map((a) => [a.id, a]));
  const inputs = candidates.map((a) => toRecommendationActivity(a, fieldsByActivity.get(a.id) ?? []));
  const ranked = rankActivities(profile, inputs, modes, { limit });

  return ranked.map((r) => ({ ...r, activity: byId.get(r.activityId)! }));
}

/**
 * 활동 상세 화면의 "추천 근거" 섹션 — 해당 활동 1건에 대한 점수/근거만 계산한다.
 * (지원 자격 제한에 걸려도 상세 화면에서는 숨기지 않고 eligibility 상태로 알려준다.)
 */
export async function loadRecommendationForActivity(
  supabase: SupabaseClient,
  profileId: string,
  activity: ActivityWithType,
  fields: ActivityFieldInput[]
): Promise<ScoredActivity> {
  const [profile, modes] = await Promise.all([
    loadRecommendationProfile(supabase, profileId),
    loadRecommendationModes(supabase),
  ]);
  return scoreActivity(profile, toRecommendationActivity(activity, fields), modes);
}
