import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient, signInAs, TEST_USERS } from "./helpers";
import { parseDbError } from "@/lib/errors";

// 5-A단계(차단): blocks 테이블/RLS 자체는 2단계부터 있었지만(본인 차단 생성/해제), 이번에
// apply_to_party·send_chat_message에 실제로 연결했다. 여기서는 DB 레벨 효과만 검증하고,
// "관련 파티 제외"는 순수 함수 단위 테스트(tests/unit/blocks.test.ts)로 커버한다. 자동 매칭
// 제외는 4-B에서 이미 tests/rls/matching_scenarios.test.ts "차단 관계" 케이스가 검증한다.

async function createPublishedTeamActivity(title: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("activities")
    .insert({ title, status: "published", participation_mode: "team", location_type: "offline", is_demo: true })
    .select("id")
    .single();
  if (error || !data) throw new Error(`테스트 활동 생성 실패: ${error?.message}`);
  return data.id as string;
}

async function deleteActivity(activityId: string) {
  const admin = createAdminClient();
  await admin.from("activities").delete().eq("id", activityId);
}

async function getRoleSlotId(partyId: string, roleName: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("party_role_slots").select("id").eq("party_id", partyId).eq("role_name", roleName).single();
  return data!.id as string;
}

async function addBlock(blockerId: string, blockedId: string) {
  const admin = createAdminClient();
  const { error } = await admin.from("blocks").insert({ blocker_id: blockerId, blocked_id: blockedId });
  if (error) throw new Error(`차단 생성 실패: ${error.message}`);
}

async function removeBlock(blockerId: string, blockedId: string) {
  const admin = createAdminClient();
  await admin.from("blocks").delete().eq("blocker_id", blockerId).eq("blocked_id", blockedId);
}

describe("차단 — 파티 지원 거부", () => {
  let activityId: string;

  afterEach(async () => {
    if (activityId) await deleteActivity(activityId);
    await removeBlock(TEST_USERS.student1.id, TEST_USERS.student3.id);
  });

  it("팀장과 차단 관계인 사용자는 파티에 지원할 수 없다", async () => {
    await addBlock(TEST_USERS.student1.id, TEST_USERS.student3.id);

    activityId = await createPublishedTeamActivity(`차단-지원거부 ${Date.now()}`);
    const leader = await signInAs(TEST_USERS.student1.email);
    const blockedApplicant = await signInAs(TEST_USERS.student3.email);

    const { data: partyId, error: createError } = await leader.rpc("create_party", {
      p_activity_id: activityId,
      p_title: "차단 테스트 파티",
      p_description: null,
      p_meeting_mode: null,
      p_recruit_deadline: null,
      p_role_slots: [{ role_name: "기획", capacity: 1 }, { role_name: "개발", capacity: 1 }],
      p_leader_role_name: "기획",
    });
    expect(createError).toBeNull();
    const devSlotId = await getRoleSlotId(partyId, "개발");

    const { error: applyError } = await blockedApplicant.rpc("apply_to_party", {
      p_party_id: partyId,
      p_role_slot_id: devSlotId,
      p_message: null,
    });
    expect(applyError).not.toBeNull();
    expect(parseDbError(applyError, "").code).toBe("BLOCKED_MEMBER");
  });

  it("차단 관계가 없으면 정상적으로 지원할 수 있다", async () => {
    activityId = await createPublishedTeamActivity(`차단없음-지원성공 ${Date.now()}`);
    const leader = await signInAs(TEST_USERS.student1.email);
    const applicant = await signInAs(TEST_USERS.student3.email);

    const { data: partyId } = await leader.rpc("create_party", {
      p_activity_id: activityId,
      p_title: "일반 테스트 파티",
      p_description: null,
      p_meeting_mode: null,
      p_recruit_deadline: null,
      p_role_slots: [{ role_name: "기획", capacity: 1 }, { role_name: "개발", capacity: 1 }],
      p_leader_role_name: "기획",
    });
    const devSlotId = await getRoleSlotId(partyId, "개발");

    const { error: applyError } = await applicant.rpc("apply_to_party", {
      p_party_id: partyId,
      p_role_slot_id: devSlotId,
      p_message: null,
    });
    expect(applyError).toBeNull();
  });
});

describe("차단 — 채팅 알림 억제", () => {
  let activityId: string;

  afterEach(async () => {
    if (activityId) await deleteActivity(activityId);
    await removeBlock(TEST_USERS.student2.id, TEST_USERS.student1.id);
  });

  it("발신자를 차단한 수신자에게는 새 메시지 알림이 생성되지 않는다", async () => {
    activityId = await createPublishedTeamActivity(`차단-알림억제 ${Date.now()}`);
    const leader = await signInAs(TEST_USERS.student1.email); // 발신자
    const member = await signInAs(TEST_USERS.student2.email); // 수신자(차단한 쪽)

    const { data: partyId } = await leader.rpc("create_party", {
      p_activity_id: activityId,
      p_title: "알림 억제 테스트 파티",
      p_description: null,
      p_meeting_mode: null,
      p_recruit_deadline: null,
      p_role_slots: [{ role_name: "기획", capacity: 1 }, { role_name: "개발", capacity: 1 }],
      p_leader_role_name: "기획",
    });
    const devSlotId = await getRoleSlotId(partyId, "개발");
    const { data: appId } = await member.rpc("apply_to_party", { p_party_id: partyId, p_role_slot_id: devSlotId, p_message: null });
    await leader.rpc("approve_application", { p_application_id: appId });

    // student2(member)가 student1(leader)을 차단한다 — 이미 같은 팀이라 강퇴되지 않고 멤버십은 유지된다.
    await addBlock(TEST_USERS.student2.id, TEST_USERS.student1.id);

    const admin = createAdminClient();
    const { data: room } = await admin.from("chat_rooms").select("id").eq("party_id", partyId).single();

    const { error: sendError } = await leader.rpc("send_chat_message", {
      p_chat_room_id: room!.id,
      p_client_message_id: `blocked-notify-${Date.now()}`,
      p_body: "차단된 사람이 보낸 메시지입니다.",
    });
    expect(sendError).toBeNull();

    // 멤버십은 유지된다(강퇴하지 않음) — member가 여전히 이 채팅방을 조회할 수 있다.
    const { data: rooms } = await member.rpc("list_my_chat_rooms");
    expect((rooms as { chat_room_id: string }[]).some((r) => r.chat_room_id === room!.id)).toBe(true);

    // 하지만 차단한 발신자의 메시지에 대한 "새 메시지" 알림은 생성되지 않는다.
    const { data: notifications } = await admin
      .from("notifications")
      .select("id")
      .eq("profile_id", TEST_USERS.student2.id)
      .eq("dedupe_key", `chat_new_message:${room!.id}`);
    expect(notifications ?? []).toHaveLength(0);
  });
});
