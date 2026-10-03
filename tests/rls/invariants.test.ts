import { describe, expect, it } from "vitest";
import { createAdminClient } from "./helpers";

// RLS는 아니지만 같은 마이그레이션에서 보장해야 하는 DB 레벨 핵심 불변식 (architecture.md 4장).
describe("DB 레벨 핵심 불변식", () => {
  it("파티 역할 슬롯 정원을 초과해 멤버를 추가하면 거부된다", async () => {
    const admin = createAdminClient();

    const { data: activity } = await admin.from("activities").select("id").limit(1).single();
    const { data: party } = await admin
      .from("parties")
      .insert({ activity_id: activity!.id, source: "manual", capacity: 1, status: "recruiting" })
      .select()
      .single();
    const { data: slot } = await admin
      .from("party_role_slots")
      .insert({ party_id: party!.id, role_name: "역할", capacity: 1 })
      .select()
      .single();

    const { data: p1 } = await admin.from("profiles").select("id").limit(2);
    expect(p1 && p1.length >= 2).toBe(true);

    const first = await admin
      .from("party_members")
      .insert({ party_id: party!.id, profile_id: p1![0].id, role_slot_id: slot!.id });
    expect(first.error).toBeNull();

    const second = await admin
      .from("party_members")
      .insert({ party_id: party!.id, profile_id: p1![1].id, role_slot_id: slot!.id });
    expect(second.error).not.toBeNull();

    await admin.from("parties").delete().eq("id", party!.id);
  });

  it("같은 활동에 두 번째 확정 팀을 만들면 유니크 제약으로 거부된다", async () => {
    const admin = createAdminClient();
    const { data: activity } = await admin.from("activities").select("id").limit(1).single();
    const { data: profile } = await admin.from("profiles").select("id").limit(1).single();

    const partyA = await admin
      .from("parties")
      .insert({ activity_id: activity!.id, source: "manual", capacity: 1, status: "confirmed" })
      .select()
      .single();
    const memberA = await admin
      .from("party_members")
      .insert({ party_id: partyA.data!.id, profile_id: profile!.id, is_confirmed: true });
    expect(memberA.error).toBeNull();

    const partyB = await admin
      .from("parties")
      .insert({ activity_id: activity!.id, source: "manual", capacity: 1, status: "confirmed" })
      .select()
      .single();
    const memberB = await admin
      .from("party_members")
      .insert({ party_id: partyB.data!.id, profile_id: profile!.id, is_confirmed: true });
    expect(memberB.error).not.toBeNull();

    await admin.from("parties").delete().in("id", [partyA.data!.id, partyB.data!.id]);
  });

  it("파티를 만들면 chat_rooms가 정확히 1개 자동 생성된다 (confirmed 여부 무관, 설계 수정 #1)", async () => {
    const admin = createAdminClient();
    const { data: activity } = await admin.from("activities").select("id").limit(1).single();

    const { data: party } = await admin
      .from("parties")
      .insert({ activity_id: activity!.id, source: "manual", capacity: 2, status: "recruiting" })
      .select()
      .single();

    const { data: rooms } = await admin.from("chat_rooms").select("id").eq("party_id", party!.id);
    expect(rooms?.length).toBe(1);

    await admin.from("parties").delete().eq("id", party!.id);
  });
});
