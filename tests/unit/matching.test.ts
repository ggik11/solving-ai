import { describe, expect, it } from "vitest";
import { findMatch, type MatchCandidate, type MatchSettings, type RoleRequirement } from "@/lib/matching";

const DEFAULT_SETTINGS: MatchSettings = { minCommonMinutes: 60, maxCandidates: 30, maxBacktrackSteps: 500 };

function candidate(
  queueId: string,
  profileId: string,
  waitSince: string,
  eligibleRoles: string[],
  leaderOptIn: boolean,
  availability: MatchCandidate["availability"]
): MatchCandidate {
  return { queueId, profileId, waitSince, eligibleRoles, leaderOptIn, availability };
}

describe("findMatch — 역할 충족", () => {
  it("역할별 정원을 정확히 채우는 조합을 찾는다", () => {
    const roles: RoleRequirement[] = [
      { roleName: "기획", capacity: 1 },
      { roleName: "개발", capacity: 1 },
    ];
    const candidates = [
      candidate("q1", "p1", "2026-01-01T00:00:00Z", ["기획"], true, [{ dayOfWeek: 1, startMinutes: 600, endMinutes: 720 }]),
      candidate("q2", "p2", "2026-01-01T00:01:00Z", ["개발"], false, [{ dayOfWeek: 1, startMinutes: 600, endMinutes: 720 }]),
    ];
    const result = findMatch(candidates, roles, [], DEFAULT_SETTINGS);
    expect(result).not.toBeNull();
    expect(result!.members).toHaveLength(2);
    expect(result!.members.map((m) => m.roleName).sort()).toEqual(["개발", "기획"]);
    expect(result!.leaderProfileId).toBe("p1");
  });

  it("역할을 채울 후보가 부족하면 null을 반환한다", () => {
    const roles: RoleRequirement[] = [
      { roleName: "기획", capacity: 1 },
      { roleName: "디자인", capacity: 1 },
    ];
    const candidates = [
      candidate("q1", "p1", "2026-01-01T00:00:00Z", ["기획"], true, [{ dayOfWeek: 1, startMinutes: 600, endMinutes: 720 }]),
      candidate("q2", "p2", "2026-01-01T00:01:00Z", ["기획"], false, [{ dayOfWeek: 1, startMinutes: 600, endMinutes: 720 }]),
    ];
    expect(findMatch(candidates, roles, [], DEFAULT_SETTINGS)).toBeNull();
  });
});

describe("findMatch — 전체 공통 시간 교집합", () => {
  it("전원이 겹치는 시간의 총합을 정확히 계산한다", () => {
    const roles: RoleRequirement[] = [
      { roleName: "A", capacity: 1 },
      { roleName: "B", capacity: 1 },
      { roleName: "C", capacity: 1 },
    ];
    const candidates = [
      candidate("q1", "p1", "2026-01-01T00:00:00Z", ["A"], true, [{ dayOfWeek: 1, startMinutes: 600, endMinutes: 780 }]), // 10-13
      candidate("q2", "p2", "2026-01-01T00:01:00Z", ["B"], false, [{ dayOfWeek: 1, startMinutes: 660, endMinutes: 840 }]), // 11-14
      candidate("q3", "p3", "2026-01-01T00:02:00Z", ["C"], false, [{ dayOfWeek: 1, startMinutes: 630, endMinutes: 750 }]), // 10:30-12:30
    ];
    // 세 구간의 교집합: max(10,11,10:30)=11:00(660) ~ min(13,14,12:30)=12:30(750) = 90분
    const result = findMatch(candidates, roles, [], { ...DEFAULT_SETTINGS, minCommonMinutes: 90 });
    expect(result).not.toBeNull();
    expect(result!.totalCommonMinutes).toBe(90);
  });

  it("겹침의 함정: 모든 쌍은 겹치지만 셋이 동시에 겹치는 시간은 없으면 매칭하지 않는다", () => {
    const roles: RoleRequirement[] = [
      { roleName: "A", capacity: 1 },
      { roleName: "B", capacity: 1 },
      { roleName: "C", capacity: 1 },
    ];
    // A-B는 월요일에, B-C는 화요일에, A-C는 수요일에만 겹친다 — 셋이 동시에 겹치는 요일은 없다.
    const candidates = [
      candidate("q1", "p1", "2026-01-01T00:00:00Z", ["A"], true, [
        { dayOfWeek: 1, startMinutes: 600, endMinutes: 720 }, // 월 10-12
        { dayOfWeek: 3, startMinutes: 600, endMinutes: 720 }, // 수 10-12
      ]),
      candidate("q2", "p2", "2026-01-01T00:01:00Z", ["B"], true, [
        { dayOfWeek: 1, startMinutes: 600, endMinutes: 720 }, // 월 10-12
        { dayOfWeek: 2, startMinutes: 600, endMinutes: 720 }, // 화 10-12
      ]),
      candidate("q3", "p3", "2026-01-01T00:02:00Z", ["C"], true, [
        { dayOfWeek: 2, startMinutes: 600, endMinutes: 720 }, // 화 10-12
        { dayOfWeek: 3, startMinutes: 600, endMinutes: 720 }, // 수 10-12
      ]),
    ];
    expect(findMatch(candidates, roles, [], DEFAULT_SETTINGS)).toBeNull();
  });
});

describe("findMatch — 팀장 동의", () => {
  it("팀장 동의자가 1명도 없으면 역할·시간이 맞아도 매칭하지 않는다", () => {
    const roles: RoleRequirement[] = [
      { roleName: "기획", capacity: 1 },
      { roleName: "개발", capacity: 1 },
    ];
    const candidates = [
      candidate("q1", "p1", "2026-01-01T00:00:00Z", ["기획"], false, [{ dayOfWeek: 1, startMinutes: 600, endMinutes: 720 }]),
      candidate("q2", "p2", "2026-01-01T00:01:00Z", ["개발"], false, [{ dayOfWeek: 1, startMinutes: 600, endMinutes: 720 }]),
    ];
    expect(findMatch(candidates, roles, [], DEFAULT_SETTINGS)).toBeNull();
  });
});

describe("findMatch — 차단 관계", () => {
  it("차단된 사용자끼리는 같은 팀으로 묶지 않고 대안을 찾는다", () => {
    const roles: RoleRequirement[] = [
      { roleName: "기획", capacity: 1 },
      { roleName: "개발", capacity: 1 },
    ];
    const availability = [{ dayOfWeek: 1, startMinutes: 600, endMinutes: 720 }];
    const candidates = [
      candidate("q1", "p1", "2026-01-01T00:00:00Z", ["기획"], true, availability),
      candidate("q2", "p2", "2026-01-01T00:01:00Z", ["개발"], false, availability), // p1과 차단
      candidate("q3", "p3", "2026-01-01T00:02:00Z", ["개발"], false, availability), // 대안
    ];
    const result = findMatch(candidates, roles, [{ profileIdA: "p1", profileIdB: "p2" }], DEFAULT_SETTINGS);
    expect(result).not.toBeNull();
    expect(result!.members.map((m) => m.profileId)).not.toContain("p2");
    expect(result!.members.map((m) => m.profileId)).toContain("p3");
  });

  it("차단 때문에 대안이 없으면 null을 반환한다", () => {
    const roles: RoleRequirement[] = [
      { roleName: "기획", capacity: 1 },
      { roleName: "개발", capacity: 1 },
    ];
    const availability = [{ dayOfWeek: 1, startMinutes: 600, endMinutes: 720 }];
    const candidates = [
      candidate("q1", "p1", "2026-01-01T00:00:00Z", ["기획"], true, availability),
      candidate("q2", "p2", "2026-01-01T00:01:00Z", ["개발"], false, availability),
    ];
    expect(findMatch(candidates, roles, [{ profileIdA: "p1", profileIdB: "p2" }], DEFAULT_SETTINGS)).toBeNull();
  });
});

describe("findMatch — 동점 규칙", () => {
  it("대기 시작 시각이 같으면 queueId 순으로 결정적으로 고른다", () => {
    const roles: RoleRequirement[] = [{ roleName: "개발", capacity: 1 }];
    const availability = [{ dayOfWeek: 1, startMinutes: 600, endMinutes: 720 }];
    const sameWait = "2026-01-01T00:00:00Z";
    const candidates = [
      candidate("q-b", "p-b", sameWait, ["개발"], true, availability),
      candidate("q-a", "p-a", sameWait, ["개발"], true, availability),
    ];
    const result = findMatch(candidates, roles, [], DEFAULT_SETTINGS);
    // "q-a" < "q-b" 문자열 순 — 대기 시각이 같으면 queueId가 빠른 쪽이 선택된다.
    expect(result!.members[0]!.queueId).toBe("q-a");
  });

  it("오래 기다린 사람을 우선 선택한다", () => {
    const roles: RoleRequirement[] = [{ roleName: "개발", capacity: 1 }];
    const availability = [{ dayOfWeek: 1, startMinutes: 600, endMinutes: 720 }];
    const candidates = [
      candidate("q-new", "p-new", "2026-01-02T00:00:00Z", ["개발"], true, availability),
      candidate("q-old", "p-old", "2026-01-01T00:00:00Z", ["개발"], true, availability),
    ];
    const result = findMatch(candidates, roles, [], DEFAULT_SETTINGS);
    expect(result!.members[0]!.profileId).toBe("p-old");
  });
});

describe("findMatch — 탐색 한도", () => {
  it("maxBacktrackSteps를 너무 낮게 주면 해가 있어도 찾지 못할 수 있다(최적해/완전탐색을 보장하지 않음)", () => {
    const roles: RoleRequirement[] = [
      { roleName: "기획", capacity: 1 },
      { roleName: "개발", capacity: 1 },
    ];
    const availability = [{ dayOfWeek: 1, startMinutes: 600, endMinutes: 720 }];
    const candidates = [
      candidate("q1", "p1", "2026-01-01T00:00:00Z", ["기획"], true, availability),
      candidate("q2", "p2", "2026-01-01T00:01:00Z", ["개발"], false, availability),
    ];
    const generous = findMatch(candidates, roles, [], { ...DEFAULT_SETTINGS, maxBacktrackSteps: 500 });
    const starved = findMatch(candidates, roles, [], { ...DEFAULT_SETTINGS, maxBacktrackSteps: 0 });
    expect(generous).not.toBeNull();
    expect(starved).toBeNull();
  });
});
