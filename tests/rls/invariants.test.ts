import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAdminClient, TEST_USERS } from "./helpers";

// RLS는 아니지만 같은 마이그레이션에서 보장해야 하는 DB 레벨 핵심 불변식 (architecture.md 4장).
//
// 버그 수정 메모: 이 파일은 원래 activities/profiles를 "select ... limit(1), ORDER BY 없이"
// 가져와 썼다. ORDER BY 없는 LIMIT은 어떤 행이 반환될지 보장하지 않는데, 실제로 그렇게 고른
// "첫 활동"이 seed.sql이 student1을 활성 멤버로 넣어 둔 바로 그 데모 활동과 종종 일치해서,
// student1을 같은 활동에 또 "활성 멤버"로 넣으려는 이 테스트 자체가 seed 데이터와 충돌해
// (party_members_one_active_per_activity 유니크 위반) 간헐적으로 실패했다(5단계 "지운 테스트
// 단언 복구" 작업 중 실제로 추적해 발견 — tests/rls/matching.test.ts의 흔들림과는 별개의 원인).
// 다른 파일들과 같은 패턴으로 테스트 전용 활동을 매번 새로 만들어 공유 상태와의 충돌을 없앤다.
describe("DB 레벨 핵심 불변식", () => {
  let activityId: string;

  beforeEach(async () => {
    const admin = createAdminClient();
    const { data } = await admin
      .from("activities")
      .insert({
        title: `불변식 테스트 활동 ${Date.now()}-${Math.random().toString(36).slice(2)}`,
        status: "published",
        participation_mode: "team",
        location_type: "offline",
        is_demo: true,
      })
      .select("id")
      .single();
    activityId = data!.id as string;
  });

  afterEach(async () => {
    const admin = createAdminClient();
    await admin.from("activities").delete().eq("id", activityId);
  });

  it("파티 역할 슬롯 정원을 초과해 멤버를 추가하면 거부된다", async () => {
    const admin = createAdminClient();

    const { data: party } = await admin
      .from("parties")
      .insert({ activity_id: activityId, source: "manual", capacity: 1, status: "recruiting" })
      .select()
      .single();
    const { data: slot } = await admin
      .from("party_role_slots")
      .insert({ party_id: party!.id, role_name: "역할", capacity: 1 })
      .select()
      .single();

    const first = await admin
      .from("party_members")
      .insert({ party_id: party!.id, profile_id: TEST_USERS.student1.id, role_slot_id: slot!.id });
    expect(first.error).toBeNull();

    const second = await admin
      .from("party_members")
      .insert({ party_id: party!.id, profile_id: TEST_USERS.student2.id, role_slot_id: slot!.id });
    expect(second.error).not.toBeNull();
  });

  it("같은 활동에 두 번째 확정 팀을 만들면 유니크 제약으로 거부된다", async () => {
    const admin = createAdminClient();

    const partyA = await admin
      .from("parties")
      .insert({ activity_id: activityId, source: "manual", capacity: 1, status: "confirmed" })
      .select()
      .single();
    const memberA = await admin
      .from("party_members")
      .insert({ party_id: partyA.data!.id, profile_id: TEST_USERS.student1.id, is_confirmed: true });
    expect(memberA.error).toBeNull();

    const partyB = await admin
      .from("parties")
      .insert({ activity_id: activityId, source: "manual", capacity: 1, status: "confirmed" })
      .select()
      .single();
    const memberB = await admin
      .from("party_members")
      .insert({ party_id: partyB.data!.id, profile_id: TEST_USERS.student1.id, is_confirmed: true });
    expect(memberB.error).not.toBeNull();
  });

  it("파티를 만들면 chat_rooms가 정확히 1개 자동 생성된다 (confirmed 여부 무관, 설계 수정 #1)", async () => {
    const admin = createAdminClient();

    const { data: party } = await admin
      .from("parties")
      .insert({ activity_id: activityId, source: "manual", capacity: 2, status: "recruiting" })
      .select()
      .single();

    const { data: rooms } = await admin.from("chat_rooms").select("id").eq("party_id", party!.id);
    expect(rooms?.length).toBe(1);
  });
});
