import { describe, expect, it } from "vitest";
import {
  DEFAULT_RECOMMENDATION_MODES,
  rankActivities,
  resolveRecommendationMode,
  scoreActivity,
  type RecommendationActivityInput,
  type RecommendationModesConfig,
  type RecommendationProfileInput,
} from "@/lib/recommend";

const MODES = DEFAULT_RECOMMENDATION_MODES;

const IT_DATA = "interest-it-data";
const ENGINEERING = "interest-engineering";
const DESIGN_MEDIA = "interest-design-media";

const EE_MAJOR = "major-electrical-engineering";

const BASE_ACTIVITY: RecommendationActivityInput = {
  id: "act-1",
  fields: [{ interestId: IT_DATA, interestName: "IT·AI·데이터", role: "primary" }],
  activityTypeId: "type-contest",
  locationType: "offline",
  region: "서울",
  applyEndAt: "2026-11-01T00:00:00Z",
  lastVerifiedAt: "2026-10-01T00:00:00Z",
  weeklyHours: null,
  eligibilityScope: "any",
  eligibleMajorIds: [],
};

const BASE_PROFILE: RecommendationProfileInput = {
  interestWeights: [{ interestId: IT_DATA, interestName: "IT·AI·데이터", weight: 1 }],
  majors: [],
  majorStatus: "not_provided",
  recommendationMode: "balanced",
  preferredActivityTypeIds: ["type-contest"],
  preferredLocationType: "offline",
  preferredRegion: "서울",
  weeklyAvailableHours: null,
};

describe("resolveRecommendationMode", () => {
  it("추천 반영 전공이 없으면 no_major를 쓴다", () => {
    expect(resolveRecommendationMode({ majorStatus: "assigned", majors: [], recommendationMode: "balanced" })).toBe(
      "no_major"
    );
  });

  it("major_status가 assigned가 아니면 전공이 있어도 no_major를 쓴다", () => {
    const majors = [{ majorId: EE_MAJOR, majorName: "전기공학전공", weight: 1, fieldWeights: {} }];
    expect(resolveRecommendationMode({ majorStatus: "exploring", majors, recommendationMode: "major_focus" })).toBe(
      "no_major"
    );
  });

  it("전공이 있고 major_status가 assigned면 사용자가 고른 모드를 쓴다", () => {
    const majors = [{ majorId: EE_MAJOR, majorName: "전기공학전공", weight: 1, fieldWeights: {} }];
    expect(resolveRecommendationMode({ majorStatus: "assigned", majors, recommendationMode: "interest_expand" })).toBe(
      "interest_expand"
    );
  });
});

describe("모드별 가중치", () => {
  it("모든 모드의 가중치 합은 1이다", () => {
    for (const mode of Object.keys(MODES) as (keyof RecommendationModesConfig)[]) {
      const sum = Object.values(MODES[mode]).reduce((s, w) => s + w, 0);
      expect(sum).toBeCloseTo(1, 10);
    }
  });

  it("균형 모드 가중치가 가이드 8.5의 공식과 일치한다", () => {
    expect(MODES.balanced).toEqual({ interest: 0.3, major: 0.25, activity_type: 0.15, participation: 0.1, time: 0.1, goal: 0.1 });
  });
});

describe("전기공학전공 94점 예시 재현 (가이드 8.5)", () => {
  // 전기공학전공 학생이 IT·AI·데이터 0.6, 전기·전자·제조·공학 0.4를 관심분야로 선택.
  // 활동의 확정 분야는 ENGINEERING(대표) + IT_DATA(부가).
  const profile: RecommendationProfileInput = {
    interestWeights: [
      { interestId: IT_DATA, interestName: "IT·AI·데이터", weight: 0.6 },
      { interestId: ENGINEERING, interestName: "전기·전자·제조·공학", weight: 0.4 },
    ],
    majors: [
      { majorId: EE_MAJOR, majorName: "전기공학전공", weight: 1, fieldWeights: { [ENGINEERING]: 1.0, [IT_DATA]: 0.5 } },
    ],
    majorStatus: "assigned",
    recommendationMode: "balanced",
    preferredActivityTypeIds: ["type-contest"],
    preferredLocationType: "offline",
    preferredRegion: "서울",
    weeklyAvailableHours: 10,
  };

  const activity: RecommendationActivityInput = {
    id: "act-ee",
    fields: [
      { interestId: ENGINEERING, interestName: "전기·전자·제조·공학", role: "primary" },
      { interestId: IT_DATA, interestName: "IT·AI·데이터", role: "secondary" },
    ],
    activityTypeId: "type-contest",
    locationType: "offline",
    region: "서울",
    applyEndAt: "2026-11-01T00:00:00Z",
    lastVerifiedAt: "2026-10-01T00:00:00Z",
    weeklyHours: 13, // 가능 시간(10h) 초과 → 시간 적합 D=0.7 (가이드 예시와 동일한 가정값)
    eligibilityScope: "any",
    eligibleMajorIds: [],
  };

  it("goal을 1.0으로 넣은 가정(가이드 원문)으로 계산하면 94점이 나온다", () => {
    // recommend.ts는 goal을 구현하지 않아 실제로 주입할 수 없다(항상 미상) — 이 테스트는
    // 가이드가 제시한 가정값(I=1.0, M=1.0, T=0.8, P=1.0, D=0.7, G=1.0)에 균형 모드 가중치를
    // 그대로 적용해 94점이 나오는 공식 자체를 재현한다(가이드 원문 그대로의 설명용 가정).
    const I = 1.0;
    const M = 1.0;
    const T = 0.8;
    const P = 1.0;
    const D = 0.7;
    const G = 1.0;
    const w = MODES.balanced;
    const score = 100 * (w.interest * I + w.major * M + w.activity_type * T + w.participation * P + w.time * D + w.goal * G);
    expect(score).toBeCloseTo(94, 5);
  });

  it("goal이 미상인 실제 계산(이번 범위 구현)에서는 goal을 제외하고 정규화해 왜곡 없이 계산된다", () => {
    const result = scoreActivity(profile, activity, MODES);
    expect(result.isDiscovery).toBe(false);
    // 유효 항목(goal 제외): interest(1.0) + major(1.0) + activity_type(1, 이진 일치) + participation(1.0) + time(0.7).
    // validWeightSum = 0.30+0.25+0.15+0.10+0.10 = 0.90, weightedSum = 0.30+0.25+0.15+0.10+0.07 = 0.87.
    const expected = (100 * 0.87) / 0.9;
    expect(result.score).toBeCloseTo(expected, 10);
    expect(result.reasons.some((r) => r.includes("전기공학전공"))).toBe(true);
  });
});

describe("scoreActivity — 전공 미배정", () => {
  it("전공이 없으면 no_major 모드(관심분야 비중 확대)로 계산하고 전공 점수 0을 부과하지 않는다", () => {
    const profile: RecommendationProfileInput = { ...BASE_PROFILE, majors: [], majorStatus: "not_provided" };
    const result = scoreActivity(profile, BASE_ACTIVITY, MODES);
    expect(result.isDiscovery).toBe(false);
    // no_major 모드는 major 가중치가 0 — 관심분야(0.55)+유형(0.15)+참여(0.10)가 전부 일치하므로 100점.
    expect(result.score).toBeCloseTo(100, 5);
    expect(result.reasons.some((r) => r.includes("전공"))).toBe(false);
  });
});

describe("scoreActivity — 복수전공 가중 평균", () => {
  const CS_MAJOR = "major-computer-science";
  const DESIGN_MAJOR = "major-animation";

  it("추천 반영 전공이 여럿이면 q(균등)로 가중 평균한다 — 전공을 더 등록했다고 중복 가산하지 않는다", () => {
    const profile: RecommendationProfileInput = {
      ...BASE_PROFILE,
      interestWeights: [],
      majors: [
        { majorId: CS_MAJOR, majorName: "컴퓨터과학전공", weight: 0.5, fieldWeights: { [IT_DATA]: 1.0 } },
        { majorId: DESIGN_MAJOR, majorName: "애니메이션전공", weight: 0.5, fieldWeights: { [DESIGN_MEDIA]: 1.0 } },
      ],
      majorStatus: "assigned",
    };
    // 활동 분야는 IT_DATA만 확정 — 컴퓨터과학전공은 r=1.0, 애니메이션전공은 연결 없어 r=0.
    // M = 0.5×1.0 + 0.5×0 = 0.5.
    const activity: RecommendationActivityInput = { ...BASE_ACTIVITY, fields: [{ interestId: IT_DATA, interestName: "IT·AI·데이터", role: "primary" }] };
    const result = scoreActivity(profile, activity, MODES);
    expect(result.isDiscovery).toBe(false);
    expect(result.fieldsUnconfirmed).toBe(false);
    // 유효 항목: major(0.25,0.5) + activity_type(0.15,1) + participation(0.10,1). validSum=0.50, weightedSum=0.375.
    expect(result.score).toBeCloseTo(75, 5);
  });
});

describe("scoreActivity — 분야 미확정 활동", () => {
  it("전공이 있는데 활동 분야가 미확정이면 major를 중립(0.5)으로 처리하고 전공 관련 근거는 만들지 않는다", () => {
    const profile: RecommendationProfileInput = {
      ...BASE_PROFILE,
      interestWeights: [],
      majors: [{ majorId: EE_MAJOR, majorName: "전기공학전공", weight: 1, fieldWeights: { [ENGINEERING]: 1.0 } }],
      majorStatus: "assigned",
    };
    const activity: RecommendationActivityInput = { ...BASE_ACTIVITY, fields: [] };
    const result = scoreActivity(profile, activity, MODES);
    expect(result.isDiscovery).toBe(false);
    expect(result.fieldsUnconfirmed).toBe(true);
    expect(result.reasons.some((r) => r.includes("전공"))).toBe(false);
    // 유효 항목: major(0.25,0.5) + activity_type(0.15,1) + participation(0.10,1). validSum=0.50, weightedSum=0.375.
    expect(result.score).toBeCloseTo(75, 5);
  });
});

describe("scoreActivity — 지정 전공 제한(지원 자격, 전공 관련성과 분리)", () => {
  const RESTRICTED_ACTIVITY: RecommendationActivityInput = {
    ...BASE_ACTIVITY,
    eligibilityScope: "restricted",
    eligibleMajorIds: [EE_MAJOR],
  };

  it("추천 반영 전공이 지정 전공에 없으면 완전히 제외된다(탐색 추천으로도 안 보임)", () => {
    const profile: RecommendationProfileInput = {
      ...BASE_PROFILE,
      majors: [{ majorId: "major-other", majorName: "다른 전공", weight: 1, fieldWeights: {} }],
      majorStatus: "assigned",
    };
    const result = scoreActivity(profile, RESTRICTED_ACTIVITY, MODES);
    expect(result.eligibility).toBe("restricted_excluded");
    expect(result.score).toBeNull();
    expect(result.isDiscovery).toBe(false);
  });

  it("추천 반영 전공이 지정 전공에 포함되면 정상적으로 점수가 계산된다", () => {
    const profile: RecommendationProfileInput = {
      ...BASE_PROFILE,
      majors: [{ majorId: EE_MAJOR, majorName: "전기공학전공", weight: 1, fieldWeights: { [IT_DATA]: 1.0 } }],
      majorStatus: "assigned",
    };
    const result = scoreActivity(profile, RESTRICTED_ACTIVITY, MODES);
    expect(result.eligibility).toBe("eligible");
    expect(result.score).not.toBeNull();
  });

  it("eligibility_scope가 unknown이면 제외하지 않고 '확인 필요'로 표시한다", () => {
    const activity: RecommendationActivityInput = { ...BASE_ACTIVITY, eligibilityScope: "unknown" };
    const result = scoreActivity(BASE_PROFILE, activity, MODES);
    expect(result.eligibility).toBe("needs_check");
    expect(result.score).not.toBeNull();
  });

  it("전공 연결표(major_field_weights)로는 지원 가능 여부를 판단하지 않는다 — 연결도가 높아도 지정 전공이 아니면 제외된다", () => {
    const profile: RecommendationProfileInput = {
      ...BASE_PROFILE,
      majors: [{ majorId: "major-other", majorName: "다른 전공", weight: 1, fieldWeights: { [IT_DATA]: 1.0 } }],
      majorStatus: "assigned",
    };
    const result = scoreActivity(profile, RESTRICTED_ACTIVITY, MODES);
    expect(result.eligibility).toBe("restricted_excluded");
  });

  it("지정 전공 제한에 걸리는 활동은 rankActivities 결과에서 완전히 빠진다", () => {
    const profile: RecommendationProfileInput = {
      ...BASE_PROFILE,
      majors: [{ majorId: "major-other", majorName: "다른 전공", weight: 1, fieldWeights: {} }],
      majorStatus: "assigned",
    };
    const ranked = rankActivities(profile, [RESTRICTED_ACTIVITY], MODES);
    expect(ranked).toHaveLength(0);
  });
});

describe("scoreActivity — 비교 불가 항목(미상) 처리", () => {
  it("비교 불가 항목은 제외하고 유효 가중치로 정규화한다", () => {
    const profile: RecommendationProfileInput = {
      ...BASE_PROFILE,
      preferredActivityTypeIds: [],
      preferredLocationType: null,
      preferredRegion: null,
    };
    const result = scoreActivity(profile, BASE_ACTIVITY, MODES);
    expect(result.isDiscovery).toBe(false);
    expect(result.score).toBeCloseTo(100, 5);
  });

  it("일치하는 항목이 없으면 0점에 가깝다", () => {
    const profile: RecommendationProfileInput = {
      interestWeights: [{ interestId: DESIGN_MEDIA, interestName: "디자인", weight: 1 }],
      majors: [],
      majorStatus: "not_provided",
      recommendationMode: "balanced",
      preferredActivityTypeIds: ["type-hackathon"],
      preferredLocationType: "online",
      preferredRegion: "부산",
      weeklyAvailableHours: null,
    };
    const result = scoreActivity(profile, BASE_ACTIVITY, MODES);
    expect(result.isDiscovery).toBe(false);
    expect(result.score).toBeCloseTo(0, 5);
    expect(result.reasons).toEqual([]);
  });

  it("근거가 거의 없으면 점수 대신 탐색 추천으로 처리한다", () => {
    const profile: RecommendationProfileInput = {
      interestWeights: [],
      majors: [],
      majorStatus: "not_provided",
      recommendationMode: "balanced",
      preferredActivityTypeIds: [],
      preferredLocationType: null,
      preferredRegion: null,
      weeklyAvailableHours: null,
    };
    const result = scoreActivity(profile, BASE_ACTIVITY, MODES);
    expect(result.isDiscovery).toBe(true);
    expect(result.score).toBeNull();
    expect(result.reasons).toEqual([]);
  });

  it("미입력 주당 투입 가능 시간을 맞는다고 표시하지 않는다", () => {
    const result = scoreActivity(BASE_PROFILE, BASE_ACTIVITY, MODES);
    expect(result.reasons.some((r) => r.includes("시간"))).toBe(false);
  });
});

describe("scoreActivity — 시간 적합", () => {
  it("활동 주당 시간이 사용자 가능 시간 이하면 일치로 계산하고 근거를 만든다", () => {
    // 근거 상위 3개 안에 시간 항목이 들어오도록 다른 항목(유형·참여)은 비교 불가로 비워둔다.
    const profile: RecommendationProfileInput = {
      ...BASE_PROFILE,
      preferredActivityTypeIds: [],
      preferredLocationType: null,
      preferredRegion: null,
      weeklyAvailableHours: 10,
    };
    const activity: RecommendationActivityInput = { ...BASE_ACTIVITY, weeklyHours: 5 };
    const result = scoreActivity(profile, activity, MODES);
    expect(result.reasons.some((r) => r.includes("시간"))).toBe(true);
  });

  it("활동 주당 시간이 사용자 가능 시간을 초과하면 비율에 따라 감소하고, 근거 부족이면 탐색으로 처리된다", () => {
    const profile: RecommendationProfileInput = {
      ...BASE_PROFILE,
      interestWeights: [],
      preferredActivityTypeIds: [],
      preferredLocationType: null,
      preferredRegion: null,
      weeklyAvailableHours: 5,
    };
    const activity: RecommendationActivityInput = { ...BASE_ACTIVITY, fields: [], weeklyHours: 10 };
    const result = scoreActivity(profile, activity, MODES);
    expect(result.isDiscovery).toBe(true); // 유효 항목이 time(0.10) 하나뿐이라 임계값(0.3) 미달.
  });
});

describe("rankActivities", () => {
  const activities: RecommendationActivityInput[] = [
    BASE_ACTIVITY,
    {
      ...BASE_ACTIVITY,
      id: "act-2",
      fields: [{ interestId: DESIGN_MEDIA, interestName: "디자인·영상", role: "primary" }],
      activityTypeId: "type-supporters",
      applyEndAt: "2026-10-15T00:00:00Z",
    },
    {
      ...BASE_ACTIVITY,
      id: "act-3",
      fields: [],
      activityTypeId: "type-marketing",
      locationType: "online",
      region: "부산",
      applyEndAt: "2026-12-01T00:00:00Z",
    },
  ];

  it("점수 높은 순으로 정렬하고, 탐색 카드는 점수 있는 카드 뒤에 둔다", () => {
    const noDataProfile: RecommendationProfileInput = {
      interestWeights: [],
      majors: [],
      majorStatus: "not_provided",
      recommendationMode: "balanced",
      preferredActivityTypeIds: [],
      preferredLocationType: null,
      preferredRegion: null,
      weeklyAvailableHours: null,
    };
    const ranked = rankActivities(BASE_PROFILE, activities, MODES);
    const scoredIds = ranked.filter((r) => !r.isDiscovery).map((r) => r.activityId);
    expect(scoredIds[0]).toBe("act-1");

    const allDiscovery = rankActivities(noDataProfile, activities, MODES);
    expect(allDiscovery.every((r) => r.isDiscovery)).toBe(true);
    expect(allDiscovery).toHaveLength(3);
  });

  it("limit을 지정하면 상위 N개만 반환한다", () => {
    const ranked = rankActivities(BASE_PROFILE, activities, MODES, { limit: 1 });
    expect(ranked).toHaveLength(1);
    expect(ranked[0].activityId).toBe("act-1");
  });

  it("동점이면 마감 임박 순으로 정렬한다", () => {
    const profile: RecommendationProfileInput = {
      interestWeights: [{ interestId: "common", interestName: "공통", weight: 1 }],
      majors: [],
      majorStatus: "not_provided",
      recommendationMode: "balanced",
      preferredActivityTypeIds: [],
      preferredLocationType: "offline",
      preferredRegion: null,
      weeklyAvailableHours: null,
    };
    const onlyTwo = activities
      .slice(0, 2)
      .map((a) => ({
        ...a,
        fields: [{ interestId: "common", interestName: "공통", role: "primary" as const }],
        locationType: "offline" as const,
      }));
    const ranked = rankActivities(profile, onlyTwo, MODES);
    const scored = ranked.filter((r) => !r.isDiscovery);
    expect(scored).toHaveLength(2);
    expect(scored[0].activityId).toBe("act-2");
  });
});
