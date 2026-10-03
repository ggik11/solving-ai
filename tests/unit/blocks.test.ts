import { describe, expect, it } from "vitest";
import { blockedCounterpartIds, filterMessagesExcludingBlocked, filterPartiesExcludingBlocked } from "@/lib/blocks";

describe("blockedCounterpartIds", () => {
  it("차단한 상대와 차단당한 상대를 방향 무관하게 모은다", () => {
    const set = blockedCounterpartIds("me", [
      { blocker_id: "me", blocked_id: "a" },
      { blocker_id: "b", blocked_id: "me" },
      { blocker_id: "x", blocked_id: "y" }, // 나와 무관한 관계는 포함하지 않는다
    ]);
    expect(set).toEqual(new Set(["a", "b"]));
  });

  it("차단 관계가 없으면 빈 집합을 반환한다", () => {
    expect(blockedCounterpartIds("me", [])).toEqual(new Set());
  });
});

describe("filterPartiesExcludingBlocked", () => {
  const partyWith = (members: { profile_id: string; status: string }[]) => ({ id: "p1", party_members: members });

  it("활성 멤버 중 차단 관계가 있으면 그 파티를 제외한다", () => {
    const parties = [partyWith([{ profile_id: "blocked", status: "active" }])];
    expect(filterPartiesExcludingBlocked(parties, new Set(["blocked"]))).toHaveLength(0);
  });

  it("탈퇴(left)한 차단 상대는 더 이상 활성 멤버가 아니므로 제외하지 않는다", () => {
    const parties = [partyWith([{ profile_id: "blocked", status: "left" }])];
    expect(filterPartiesExcludingBlocked(parties, new Set(["blocked"]))).toHaveLength(1);
  });

  it("차단 집합이 비어 있으면 원본을 그대로 반환한다", () => {
    const parties = [partyWith([{ profile_id: "a", status: "active" }])];
    expect(filterPartiesExcludingBlocked(parties, new Set())).toHaveLength(1);
  });
});

describe("filterMessagesExcludingBlocked", () => {
  it("차단한 발신자의 메시지를 숨긴다", () => {
    const messages = [
      { id: "1", sender_id: "blocked" },
      { id: "2", sender_id: "other" },
    ];
    expect(filterMessagesExcludingBlocked(messages, new Set(["blocked"]))).toEqual([{ id: "2", sender_id: "other" }]);
  });

  it("시스템 메시지(sender_id=null)는 차단과 무관하게 항상 남긴다", () => {
    const messages = [{ id: "1", sender_id: null }];
    expect(filterMessagesExcludingBlocked(messages, new Set(["anyone"]))).toEqual(messages);
  });
});
