import { describe, expect, it } from "vitest";
import {
  rankActivities,
  scoreActivity,
  type RecommendationActivityInput,
  type RecommendationProfileInput,
  type RecommendationWeights,
} from "@/lib/recommend";

const WEIGHTS: RecommendationWeights = {
  interest: 35,
  preferred_activity_type: 20,
  major_relevance: 15,
  region_mode: 15,
  duration_time_fit: 15,
};

const BASE_ACTIVITY: RecommendationActivityInput = {
  id: "act-1",
  title: "환경 공모전 모집 1기",
  tags: ["환경"],
  activityTypeId: "type-contest",
  locationType: "offline",
  region: "서울",
  applyEndAt: "2026-11-01T00:00:00Z",
  lastVerifiedAt: "2026-10-01T00:00:00Z",
};

const BASE_PROFILE: RecommendationProfileInput = {
  interestNames: ["환경"],
  preferredActivityTypeIds: ["type-contest"],
  majorKeywords: [],
  preferredLocationType: "offline",
  preferredRegion: "서울",
};

describe("scoreActivity", () => {
  it("모든 항목이 일치하면 100점에 가깝고, 근거가 2~3개 포함된다", () => {
    const result = scoreActivity(BASE_PROFILE, BASE_ACTIVITY, WEIGHTS);
    expect(result.isDiscovery).toBe(false);
    // duration_time_fit은 항상 미상이라 나머지 4개(interest/type/region, major는 미상)로 정규화됨.
    expect(result.score).toBeCloseTo(100, 5);
    expect(result.reasons.length).toBeGreaterThanOrEqual(2);
    expect(result.reasons.length).toBeLessThanOrEqual(3);
    expect(result.reasons.some((r) => r.includes("환경"))).toBe(true);
  });

  it("비교 불가 항목(미상)은 제외하고 유효 가중치로 정규화한다", () => {
    const profile: RecommendationProfileInput = {
      ...BASE_PROFILE,
      preferredActivityTypeIds: [], // 미상 처리
      preferredLocationType: null,
      preferredRegion: null,
    };
    // 남는 것: interest(35, compat=1), major(15, 미상 - majorKeywords 없음), duration(미상)
    // => 유효 가중치 35만 남고 compat=1 이므로 100점.
    const result = scoreActivity(profile, BASE_ACTIVITY, WEIGHTS);
    expect(result.isDiscovery).toBe(false);
    expect(result.score).toBeCloseTo(100, 5);
  });

  it("일치하는 항목이 없으면 0점에 가깝다", () => {
    const profile: RecommendationProfileInput = {
      interestNames: ["디자인"],
      preferredActivityTypeIds: ["type-hackathon"],
      majorKeywords: [],
      preferredLocationType: "online",
      preferredRegion: "부산",
    };
    const result = scoreActivity(profile, BASE_ACTIVITY, WEIGHTS);
    expect(result.isDiscovery).toBe(false);
    expect(result.score).toBeCloseTo(0, 5);
    expect(result.reasons).toEqual([]);
  });

  it("근거가 거의 없으면(유효 가중치 합이 임계값 미만) 점수 대신 탐색 추천으로 처리한다", () => {
    const profile: RecommendationProfileInput = {
      interestNames: [],
      preferredActivityTypeIds: [],
      majorKeywords: [],
      preferredLocationType: null,
      preferredRegion: null,
    };
    const result = scoreActivity(profile, BASE_ACTIVITY, WEIGHTS);
    expect(result.isDiscovery).toBe(true);
    expect(result.score).toBeNull();
    expect(result.reasons).toEqual([]);
  });

  it("미입력 일정(주당 가능 시간 등)을 맞는다고 표시하지 않는다", () => {
    // duration_time_fit은 현재 스키마상 항상 미상이어야 하며, 어떤 입력으로도 "일치" 근거를 만들지 않는다.
    const result = scoreActivity(BASE_PROFILE, BASE_ACTIVITY, WEIGHTS);
    expect(result.reasons.some((r) => r.includes("시간") || r.includes("일정"))).toBe(false);
  });

  it("major_relevance는 전공 키워드가 제목/태그에 포함될 때만 일치로 본다", () => {
    const profile: RecommendationProfileInput = { ...BASE_PROFILE, majorKeywords: ["컴퓨터"] };
    const noMatch = scoreActivity(profile, BASE_ACTIVITY, WEIGHTS);
    expect(noMatch.reasons.some((r) => r.includes("전공"))).toBe(false);

    const matchingActivity: RecommendationActivityInput = {
      ...BASE_ACTIVITY,
      title: "컴퓨터공학 해커톤",
    };
    const match = scoreActivity(profile, matchingActivity, WEIGHTS);
    expect(match.reasons.some((r) => r.includes("전공"))).toBe(true);
  });
});

describe("rankActivities", () => {
  const activities: RecommendationActivityInput[] = [
    BASE_ACTIVITY,
    {
      ...BASE_ACTIVITY,
      id: "act-2",
      title: "디자인 서포터즈 모집",
      tags: ["디자인"],
      activityTypeId: "type-supporters",
      applyEndAt: "2026-10-15T00:00:00Z",
    },
    {
      ...BASE_ACTIVITY,
      id: "act-3",
      title: "완전 무관한 활동",
      tags: ["마케팅"],
      activityTypeId: "type-marketing",
      locationType: "online",
      region: "부산",
      applyEndAt: "2026-12-01T00:00:00Z",
    },
  ];

  it("점수 높은 순으로 정렬하고, 탐색 카드는 점수 있는 카드 뒤에 둔다", () => {
    const noDataProfile: RecommendationProfileInput = {
      interestNames: [],
      preferredActivityTypeIds: [],
      majorKeywords: [],
      preferredLocationType: null,
      preferredRegion: null,
    };
    const ranked = rankActivities(BASE_PROFILE, activities, WEIGHTS);
    const scoredIds = ranked.filter((r) => !r.isDiscovery).map((r) => r.activityId);
    expect(scoredIds[0]).toBe("act-1");

    const allDiscovery = rankActivities(noDataProfile, activities, WEIGHTS);
    expect(allDiscovery.every((r) => r.isDiscovery)).toBe(true);
    expect(allDiscovery).toHaveLength(3);
  });

  it("limit을 지정하면 상위 N개만 반환한다", () => {
    const ranked = rankActivities(BASE_PROFILE, activities, WEIGHTS, { limit: 1 });
    expect(ranked).toHaveLength(1);
    expect(ranked[0].activityId).toBe("act-1");
  });

  it("동점이면 마감 임박 순으로 정렬한다", () => {
    const profile: RecommendationProfileInput = {
      interestNames: ["공통"],
      preferredActivityTypeIds: [],
      majorKeywords: [],
      preferredLocationType: "offline",
      preferredRegion: null,
    };
    // act-1, act-2 모두 태그/진행방식이 똑같이 일치 -> 동점, act-2가 마감이 더 빠름.
    const onlyTwo = activities
      .slice(0, 2)
      .map((a) => ({ ...a, tags: ["공통"], locationType: "offline" as const }));
    const ranked = rankActivities(profile, onlyTwo, WEIGHTS);
    const scored = ranked.filter((r) => !r.isDiscovery);
    expect(scored).toHaveLength(2);
    expect(scored[0].activityId).toBe("act-2");
  });
});
