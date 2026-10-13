/**
 * 추천 점수 계산 (순수 함수). docs/teachable-machine-integration.md 4장 규칙을 구현한다.
 *
 *   score = 100 × Σ(weight_i × compatibility_i) / Σ(valid_weight_i)
 *
 * - compatibility_i는 0~1, 비교 불가(데이터 없음)한 항목은 "미상"으로 제외하고
 *   유효 가중치 합으로 정규화한다.
 * - 가중치는 추천 모드(균형/전공 중심/관심 확장/전공 미배정)별로 다르고 합계는 1이다.
 * - 근거가 너무 적으면(유효 가중치 합이 임계값 미만) 점수 대신 탐색(디스커버리) 추천으로 대체한다.
 * - 지정 전공 제한(eligibility_scope='restricted')에 해당하지 않는 사용자는 결과에서 완전히 제외한다
 *   (탐색 추천으로도 보이지 않음) — 전공 연결표로는 지원 가능 여부를 판단하지 않는다(가이드 8.4).
 * - 노출 근거는 실제 계산에 쓰인 항목 중 기여도(weight × compatibility)가 큰 2~3개만 반환한다.
 */

export type LocationType = "online" | "offline" | "hybrid";
export type MajorStatus = "assigned" | "exploring" | "unlisted" | "not_provided";
export type EligibilityScope = "any" | "restricted" | "unknown";
export type EligibilityStatus = "eligible" | "restricted_excluded" | "needs_check";

/** 'no_major'는 사용자가 직접 고르지 않는다 — 전공 미반영 상태를 감지해 recommend.ts가 대신 적용한다. */
export type RecommendationMode = "balanced" | "major_focus" | "interest_expand" | "no_major";
export type UserSelectableRecommendationMode = Exclude<RecommendationMode, "no_major">;

export interface RecommendationModeWeights {
  interest: number;
  major: number;
  activity_type: number;
  participation: number;
  time: number;
  goal: number;
}

export type RecommendationModesConfig = Record<RecommendationMode, RecommendationModeWeights>;

export const DEFAULT_RECOMMENDATION_MODES: RecommendationModesConfig = {
  balanced: { interest: 0.3, major: 0.25, activity_type: 0.15, participation: 0.1, time: 0.1, goal: 0.1 },
  major_focus: { interest: 0.15, major: 0.4, activity_type: 0.15, participation: 0.1, time: 0.1, goal: 0.1 },
  interest_expand: { interest: 0.45, major: 0.1, activity_type: 0.15, participation: 0.1, time: 0.1, goal: 0.1 },
  no_major: { interest: 0.55, major: 0, activity_type: 0.15, participation: 0.1, time: 0.1, goal: 0.1 },
};

/** 사용자가 선택한 관심분야 하나의 우선순위 가중치(합 1로 정규화됨)와 표시명. */
export interface InterestWeightInput {
  interestId: string;
  interestName: string;
  weight: number;
}

/** 추천에 반영하는 전공 하나 — q(전공 간 비중, 합 1)와 그 전공의 분야 연결표(interestId -> 1.0|0.5). */
export interface MajorRelevanceInput {
  majorId: string;
  majorName: string;
  weight: number;
  fieldWeights: Record<string, number>;
}

export interface RecommendationProfileInput {
  interestWeights: InterestWeightInput[];
  /** major_status==='assigned'이고 추천에 반영(use_for_recommendation)하도록 선택한 전공만. */
  majors: MajorRelevanceInput[];
  majorStatus: MajorStatus;
  recommendationMode: UserSelectableRecommendationMode;
  preferredActivityTypeIds: string[];
  preferredLocationType: LocationType | null;
  preferredRegion: string | null;
  weeklyAvailableHours: number | null;
}

/** 관리자가 확정한 활동의 서비스 분야 하나(activity_fields). */
export interface ActivityFieldInput {
  interestId: string;
  interestName: string;
  role: "primary" | "secondary";
}

export interface RecommendationActivityInput {
  id: string;
  fields: ActivityFieldInput[];
  activityTypeId: string | null;
  locationType: LocationType;
  region: string | null;
  applyEndAt: string | null;
  lastVerifiedAt: string | null;
  weeklyHours: number | null;
  eligibilityScope: EligibilityScope;
  eligibleMajorIds: string[];
}

export interface ScoredActivity {
  activityId: string;
  /** null = 근거 부족으로 탐색(디스커버리) 추천, 또는 지원 자격 제한으로 제외됨. */
  score: number | null;
  isDiscovery: boolean;
  /** 실제 계산에 쓰인 근거 2~3개. */
  reasons: string[];
  eligibility: EligibilityStatus;
  /** 전공은 반영되는데 활동 분야가 아직 확정되지 않아 전공 항목을 중립(0.5)으로 계산한 경우. */
  fieldsUnconfirmed: boolean;
}

interface SubScore {
  key: keyof RecommendationModeWeights;
  known: boolean;
  compatibility: number; // 0~1, known=false면 의미 없음
  reason: string | null; // compatibility > 0이고 known일 때만
  fieldsUnconfirmed?: boolean;
}

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

/** 전공이 있는데 활동 분야가 미확정이면 major를 중립값으로 처리한다 (가이드 4장, "전공 항목의 특별 규칙"). */
const NEUTRAL_MAJOR_COMPATIBILITY = 0.5;

function scoreInterest(profile: RecommendationProfileInput, activity: RecommendationActivityInput): SubScore {
  if (profile.interestWeights.length === 0 || activity.fields.length === 0) {
    return { key: "interest", known: false, compatibility: 0, reason: null };
  }
  const fieldIds = new Set(activity.fields.map((f) => f.interestId));
  let compatibility = 0;
  let best: { name: string; weight: number } | null = null;
  for (const iw of profile.interestWeights) {
    if (!fieldIds.has(iw.interestId)) continue;
    compatibility += iw.weight;
    if (!best || iw.weight > best.weight) best = { name: iw.interestName, weight: iw.weight };
  }
  compatibility = Math.min(1, compatibility);
  return {
    key: "interest",
    known: true,
    compatibility,
    reason: best ? `선택한 '${best.name}' 관심분야와 일치` : null,
  };
}

function scoreMajor(profile: RecommendationProfileInput, activity: RecommendationActivityInput): SubScore {
  if (profile.majors.length === 0) {
    return { key: "major", known: false, compatibility: 0, reason: null };
  }
  if (activity.fields.length === 0) {
    // 활동 분야 자체가 미확정 — 중립값으로 처리하고 전공 관련 근거는 만들지 않는다.
    return { key: "major", known: true, compatibility: NEUTRAL_MAJOR_COMPATIBILITY, reason: null, fieldsUnconfirmed: true };
  }

  let totalQ = 0;
  let weightedSum = 0;
  let best: { majorName: string; interestName: string; contribution: number } | null = null;
  for (const major of profile.majors) {
    totalQ += major.weight;
    let r = 0;
    let rFieldName: string | null = null;
    for (const field of activity.fields) {
      const w = major.fieldWeights[field.interestId] ?? 0;
      if (w > r) {
        r = w;
        rFieldName = field.interestName;
      }
    }
    weightedSum += major.weight * r;
    const contribution = major.weight * r;
    if (r > 0 && (!best || contribution > best.contribution)) {
      best = { majorName: major.majorName, interestName: rFieldName!, contribution };
    }
  }
  const compatibility = totalQ > 0 ? weightedSum / totalQ : 0;
  return {
    key: "major",
    known: true,
    compatibility,
    reason: best ? `${best.majorName}과 연결된 ${best.interestName} 분야` : null,
  };
}

function scoreActivityType(profile: RecommendationProfileInput, activity: RecommendationActivityInput): SubScore {
  if (profile.preferredActivityTypeIds.length === 0 || !activity.activityTypeId) {
    return { key: "activity_type", known: false, compatibility: 0, reason: null };
  }
  const matches = profile.preferredActivityTypeIds.includes(activity.activityTypeId);
  return {
    key: "activity_type",
    known: true,
    compatibility: matches ? 1 : 0,
    reason: matches ? "희망 활동 유형과 일치" : null,
  };
}

function scoreParticipation(profile: RecommendationProfileInput, activity: RecommendationActivityInput): SubScore {
  const hasLocationPref = profile.preferredLocationType !== null;
  const hasRegionPref = Boolean(profile.preferredRegion && profile.preferredRegion.trim().length > 0);
  if (!hasLocationPref && !hasRegionPref) {
    return { key: "participation", known: false, compatibility: 0, reason: null };
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
    return { key: "participation", known: false, compatibility: 0, reason: null };
  }
  const compatibility = parts.reduce((sum, p) => sum + p.compatibility, 0) / parts.length;
  const reason = parts.find((p) => p.reason)?.reason ?? null;
  return { key: "participation", known: true, compatibility, reason };
}

function scoreTime(profile: RecommendationProfileInput, activity: RecommendationActivityInput): SubScore {
  if (profile.weeklyAvailableHours == null || activity.weeklyHours == null) {
    return { key: "time", known: false, compatibility: 0, reason: null };
  }
  let compatibility: number;
  if (activity.weeklyHours <= profile.weeklyAvailableHours) {
    compatibility = 1;
  } else if (profile.weeklyAvailableHours <= 0) {
    compatibility = 0;
  } else {
    compatibility = Math.max(0, 1 - (activity.weeklyHours - profile.weeklyAvailableHours) / profile.weeklyAvailableHours);
  }
  return {
    key: "time",
    known: true,
    compatibility,
    reason: compatibility === 1 ? "주당 투입 가능 시간 안에 들어와요" : null,
  };
}

// 활동 목표(goal) 일치는 이번 범위에서 구현하지 않는다(가이드 4장) — 항상 "미상"으로 제외한다.
function scoreGoal(): SubScore {
  return { key: "goal", known: false, compatibility: 0, reason: null };
}

/**
 * 사용자의 추천 반영 전공이 하나도 없거나 major_status가 assigned가 아니면 'no_major' 모드를 쓴다
 * (가이드 4장 "모드 선택"). 'no_major'는 major 가중치가 0이라 전공 점수 0을 그대로 부과하지 않는다.
 */
export function resolveRecommendationMode(
  profile: Pick<RecommendationProfileInput, "majorStatus" | "majors" | "recommendationMode">
): RecommendationMode {
  if (profile.majorStatus !== "assigned" || profile.majors.length === 0) return "no_major";
  return profile.recommendationMode;
}

/**
 * 지원 자격 판정. 'restricted'인데 추천 반영 전공이 지정 전공에 없으면 제외 대상이다.
 * 복수전공·부전공 인정 여부는 원문을 따른다는 안내는 화면에서 표시한다(가이드 4장).
 */
function resolveEligibility(profile: RecommendationProfileInput, activity: RecommendationActivityInput): EligibilityStatus {
  if (activity.eligibilityScope === "any") return "eligible";
  if (activity.eligibilityScope === "unknown") return "needs_check";
  const userMajorIds = new Set(profile.majors.map((m) => m.majorId));
  const matches = activity.eligibleMajorIds.some((id) => userMajorIds.has(id));
  return matches ? "eligible" : "restricted_excluded";
}

export const DEFAULT_DISCOVERY_THRESHOLD_RATIO = 0.3;

export interface ScoreActivityOptions {
  /** 유효 가중치 합이 (전체 가중치 합 × 이 비율) 미만이면 탐색 추천으로 처리. 기본 0.3. */
  discoveryThresholdRatio?: number;
}

export function scoreActivity(
  profile: RecommendationProfileInput,
  activity: RecommendationActivityInput,
  modes: RecommendationModesConfig,
  options: ScoreActivityOptions = {}
): ScoredActivity {
  const eligibility = resolveEligibility(profile, activity);
  const mode = resolveRecommendationMode(profile);
  const weights = modes[mode];

  const subScores: SubScore[] = [
    scoreInterest(profile, activity),
    scoreMajor(profile, activity),
    scoreActivityType(profile, activity),
    scoreParticipation(profile, activity),
    scoreTime(profile, activity),
    scoreGoal(),
  ];
  const fieldsUnconfirmed = subScores.some((s) => s.fieldsUnconfirmed === true);

  if (eligibility === "restricted_excluded") {
    // 전공 연결표로는 지원 가능 여부를 판단하지 않는다 — 완전히 제외하고 탐색 추천으로도 대체하지 않는다.
    return { activityId: activity.id, score: null, isDiscovery: false, reasons: [], eligibility, fieldsUnconfirmed };
  }

  const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
  const threshold = totalWeight * (options.discoveryThresholdRatio ?? DEFAULT_DISCOVERY_THRESHOLD_RATIO);

  const known = subScores.filter((s) => s.known);
  const validWeightSum = known.reduce((sum, s) => sum + weights[s.key], 0);

  if (known.length === 0 || validWeightSum < threshold) {
    return { activityId: activity.id, score: null, isDiscovery: true, reasons: [], eligibility, fieldsUnconfirmed };
  }

  const weightedSum = known.reduce((sum, s) => sum + weights[s.key] * s.compatibility, 0);
  const score = (100 * weightedSum) / validWeightSum;

  const reasons = known
    .filter((s) => s.reason !== null && s.compatibility > 0)
    .sort((a, b) => weights[b.key] * b.compatibility - weights[a.key] * a.compatibility)
    .slice(0, 3)
    .map((s) => s.reason as string);

  return { activityId: activity.id, score, isDiscovery: false, reasons, eligibility, fieldsUnconfirmed };
}

export interface RankActivitiesOptions extends ScoreActivityOptions {
  limit?: number;
}

/**
 * 점수순 정렬 + 탐색 카드 보강. 동점/탐색 정렬은 마감 임박 → 최근 확인일 순으로 결정적이다.
 * 탐색 카드는 activity_type별로 고르게 섞는다. 지원 자격 제한에 걸리는 활동은 결과에서 완전히 뺀다.
 */
export function rankActivities(
  profile: RecommendationProfileInput,
  activities: RecommendationActivityInput[],
  modes: RecommendationModesConfig,
  options: RankActivitiesOptions = {}
): ScoredActivity[] {
  const byId = new Map(activities.map((a) => [a.id, a]));
  const scoredAll = activities.map((a) => scoreActivity(profile, a, modes, options));
  const scored = scoredAll.filter((s) => s.eligibility !== "restricted_excluded");

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
