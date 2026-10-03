/**
 * 추천 점수 계산 (순수 함수). architecture.md 7장 규칙을 그대로 구현한다.
 *
 *   score = 100 × Σ(weight_i × compatibility_i) / Σ(valid_weight_i)
 *
 * - compatibility_i는 0~1, 비교 불가(데이터 없음)한 항목은 "미상"으로 제외하고
 *   유효 가중치 합으로 정규화한다.
 * - 근거가 너무 적으면(유효 가중치 합이 임계값 미만) 점수 대신 탐색(디스커버리) 추천으로 대체한다.
 * - 노출 근거는 실제 계산에 쓰인 항목 중 기여도(weight × compatibility)가 큰 2~3개만 반환한다.
 */

export type LocationType = "online" | "offline" | "hybrid";

export interface RecommendationWeights {
  interest: number;
  preferred_activity_type: number;
  major_relevance: number;
  region_mode: number;
  duration_time_fit: number;
}

export interface RecommendationProfileInput {
  /** profile_interests → interests.name, lowercase 처리는 호출부에서 하지 않아도 됨(내부에서 정규화). */
  interestNames: string[];
  preferredActivityTypeIds: string[];
  /** profile_majors → majors.department/name 등, 활동 태그·제목과의 느슨한 키워드 매칭에 사용. */
  majorKeywords: string[];
  preferredLocationType: LocationType | null;
  preferredRegion: string | null;
}

export interface RecommendationActivityInput {
  id: string;
  title: string;
  tags: string[];
  activityTypeId: string | null;
  locationType: LocationType;
  region: string | null;
  applyEndAt: string | null;
  lastVerifiedAt: string | null;
}

export interface ScoredActivity {
  activityId: string;
  /** null = 근거 부족으로 탐색(디스커버리) 추천. */
  score: number | null;
  isDiscovery: boolean;
  /** 실제 계산에 쓰인 근거 2~3개 ("관심분야: 환경과 일치" 등). */
  reasons: string[];
}

interface SubScore {
  key: keyof RecommendationWeights;
  known: boolean;
  compatibility: number; // 0~1, known=false면 의미 없음
  reason: string | null; // compatibility > 0이고 known일 때만
}

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function scoreInterest(profile: RecommendationProfileInput, activity: RecommendationActivityInput): SubScore {
  if (profile.interestNames.length === 0 || activity.tags.length === 0) {
    return { key: "interest", known: false, compatibility: 0, reason: null };
  }
  const profileInterests = new Set(profile.interestNames.map(normalize));
  const activityTags = activity.tags.map(normalize);
  const matched = activityTags.filter((tag) => profileInterests.has(tag));
  const uniqueMatched = Array.from(new Set(matched));
  const compatibility = Math.min(1, uniqueMatched.length / profile.interestNames.length);
  return {
    key: "interest",
    known: true,
    compatibility,
    reason: uniqueMatched.length > 0 ? `관심분야 '${uniqueMatched[0]}' 일치` : null,
  };
}

function scorePreferredActivityType(
  profile: RecommendationProfileInput,
  activity: RecommendationActivityInput
): SubScore {
  if (profile.preferredActivityTypeIds.length === 0 || !activity.activityTypeId) {
    return { key: "preferred_activity_type", known: false, compatibility: 0, reason: null };
  }
  const matches = profile.preferredActivityTypeIds.includes(activity.activityTypeId);
  return {
    key: "preferred_activity_type",
    known: true,
    compatibility: matches ? 1 : 0,
    reason: matches ? "희망 활동 유형과 일치" : null,
  };
}

function scoreMajorRelevance(profile: RecommendationProfileInput, activity: RecommendationActivityInput): SubScore {
  if (profile.majorKeywords.length === 0) {
    return { key: "major_relevance", known: false, compatibility: 0, reason: null };
  }
  const haystack = normalize(`${activity.title} ${activity.tags.join(" ")}`);
  const matchedKeyword = profile.majorKeywords.map(normalize).find((kw) => kw.length > 0 && haystack.includes(kw));
  return {
    key: "major_relevance",
    known: true,
    compatibility: matchedKeyword ? 1 : 0,
    reason: matchedKeyword ? `전공 키워드 '${matchedKeyword}' 포함` : null,
  };
}

function scoreRegionMode(profile: RecommendationProfileInput, activity: RecommendationActivityInput): SubScore {
  const hasLocationPref = profile.preferredLocationType !== null;
  const hasRegionPref = Boolean(profile.preferredRegion && profile.preferredRegion.trim().length > 0);
  if (!hasLocationPref && !hasRegionPref) {
    return { key: "region_mode", known: false, compatibility: 0, reason: null };
  }

  const parts: { compatibility: number; reason: string | null }[] = [];
  if (hasLocationPref) {
    const match = profile.preferredLocationType === activity.locationType;
    parts.push({ compatibility: match ? 1 : 0, reason: match ? "선호하는 진행 방식과 일치" : null });
  }
  if (hasRegionPref && activity.region) {
    const match = normalize(profile.preferredRegion!) === normalize(activity.region);
    parts.push({ compatibility: match ? 1 : 0, reason: match ? `선호 지역 '${activity.region}' 일치` : null });
  }
  if (parts.length === 0) {
    return { key: "region_mode", known: false, compatibility: 0, reason: null };
  }
  const compatibility = parts.reduce((sum, p) => sum + p.compatibility, 0) / parts.length;
  const reason = parts.find((p) => p.reason)?.reason ?? null;
  return { key: "region_mode", known: true, compatibility, reason };
}

// 활동별 "주당 투입 시간" 같은 비교 가능한 필드가 현재 스키마에 없어 항상 "미상"으로 처리한다
// (지시서 6장 "비교 불가 항목은 미상으로 제외" 원칙 — 데이터가 생기기 전까지 억지로 점수를 만들지 않는다).
function scoreDurationTimeFit(): SubScore {
  return { key: "duration_time_fit", known: false, compatibility: 0, reason: null };
}

export const DEFAULT_DISCOVERY_THRESHOLD_RATIO = 0.3;

export interface ScoreActivityOptions {
  /** 유효 가중치 합이 (전체 가중치 합 × 이 비율) 미만이면 탐색 추천으로 처리. 기본 0.3. */
  discoveryThresholdRatio?: number;
}

export function scoreActivity(
  profile: RecommendationProfileInput,
  activity: RecommendationActivityInput,
  weights: RecommendationWeights,
  options: ScoreActivityOptions = {}
): ScoredActivity {
  const subScores = [
    scoreInterest(profile, activity),
    scorePreferredActivityType(profile, activity),
    scoreMajorRelevance(profile, activity),
    scoreRegionMode(profile, activity),
    scoreDurationTimeFit(),
  ];

  const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
  const threshold = totalWeight * (options.discoveryThresholdRatio ?? DEFAULT_DISCOVERY_THRESHOLD_RATIO);

  const known = subScores.filter((s) => s.known);
  const validWeightSum = known.reduce((sum, s) => sum + weights[s.key], 0);

  if (known.length === 0 || validWeightSum < threshold) {
    return { activityId: activity.id, score: null, isDiscovery: true, reasons: [] };
  }

  const weightedSum = known.reduce((sum, s) => sum + weights[s.key] * s.compatibility, 0);
  const score = (100 * weightedSum) / validWeightSum;

  const reasons = known
    .filter((s) => s.reason !== null && s.compatibility > 0)
    .sort((a, b) => weights[b.key] * b.compatibility - weights[a.key] * a.compatibility)
    .slice(0, 3)
    .map((s) => s.reason as string);

  return { activityId: activity.id, score, isDiscovery: false, reasons };
}

export interface RankActivitiesOptions extends ScoreActivityOptions {
  limit?: number;
}

/**
 * 점수순 정렬 + 탐색 카드 보강. 동점/탐색 정렬은 마감 임박 → 최근 확인일 순으로 결정적이다.
 * 탐색 카드는 activity_type별로 고르게 섞는다(지시서 6장 "특정 분야 편중 방지").
 */
export function rankActivities(
  profile: RecommendationProfileInput,
  activities: RecommendationActivityInput[],
  weights: RecommendationWeights,
  options: RankActivitiesOptions = {}
): ScoredActivity[] {
  const byId = new Map(activities.map((a) => [a.id, a]));
  const scored = activities.map((a) => scoreActivity(profile, a, weights, options));

  const byDeadlineThenVerified = (aId: string, bId: string) => {
    const a = byId.get(aId)!;
    const b = byId.get(bId)!;
    const aDeadline = a.applyEndAt ? new Date(a.applyEndAt).getTime() : Infinity;
    const bDeadline = b.applyEndAt ? new Date(b.applyEndAt).getTime() : Infinity;
    if (aDeadline !== bDeadline) return aDeadline - bDeadline;
    const aVerified = a.lastVerifiedAt ? new Date(a.lastVerifiedAt).getTime() : 0;
    const bVerified = b.lastVerifiedAt ? new Date(b.lastVerifiedAt).getTime() : 0;
    if (aVerified !== bVerified) return bVerified - aVerified;
    return aId.localeCompare(bId);
  };

  const ranked = scored
    .filter((s) => !s.isDiscovery)
    .sort((a, b) => {
      if (b.score! !== a.score!) return b.score! - a.score!;
      return byDeadlineThenVerified(a.activityId, b.activityId);
    });

  const discoveryByType = new Map<string, ScoredActivity[]>();
  for (const s of scored) {
    if (!s.isDiscovery) continue;
    const typeKey = byId.get(s.activityId)?.activityTypeId ?? "__none__";
    const bucket = discoveryByType.get(typeKey) ?? [];
    bucket.push(s);
    discoveryByType.set(typeKey, bucket);
  }
  for (const bucket of discoveryByType.values()) {
    bucket.sort((a, b) => byDeadlineThenVerified(a.activityId, b.activityId));
  }
  const discoveryInterleaved: ScoredActivity[] = [];
  const buckets = Array.from(discoveryByType.values());
  let i = 0;
  while (discoveryInterleaved.length < scored.filter((s) => s.isDiscovery).length) {
    const bucket = buckets[i % buckets.length];
    const item = bucket?.shift();
    if (item) discoveryInterleaved.push(item);
    i += 1;
    if (buckets.every((b) => b.length === 0)) break;
  }

  const combined = [...ranked, ...discoveryInterleaved];
  return options.limit ? combined.slice(0, options.limit) : combined;
}
