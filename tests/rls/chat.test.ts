import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAdminClient, signInAs, TEST_USERS } from "./helpers";

// 4-A단계: 팀 채팅 DB 함수(send_chat_message/mark_chat_read)와 RLS를 검증한다
// (architecture.md 4장, 지시서 8장 "검증" 요구사항).

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

async function getChatRoomId(partyId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("chat_rooms").select("id").eq("party_id", partyId).single();
  return data!.id as string;
}

describe("팀 채팅 — DB 함수/RLS", () => {
  let activityId: string;
  let partyId: string;
  let chatRoomId: string;

  beforeEach(async () => {
    activityId = await createPublishedTeamActivity(`채팅 테스트 활동 ${Date.now()}-${Math.random().toString(36).slice(2)}`);

    const leader = await signInAs(TEST_USERS.student1.email);
    const { data: createdPartyId, error: createError } = await leader.rpc("create_party", {
      p_activity_id: activityId,
      p_title: "채팅 테스트 파티",
      p_description: null,
      p_meeting_mode: null,
      p_recruit_deadline: null,
      p_role_slots: [{ role_name: "팀원", capacity: 2 }],
      p_leader_role_name: "팀원",
    });
    if (createError || !createdPartyId) throw new Error(`파티 생성 실패: ${createError?.message}`);
    partyId = createdPartyId as string;

    const admin = createAdminClient();
    const { data: slot } = await admin.from("party_role_slots").select("id").eq("party_id", partyId).single();

    const applicant = await signInAs(TEST_USERS.student2.email);
    const { data: appId, error: applyError } = await applicant.rpc("apply_to_party", {
      p_party_id: partyId,
      p_role_slot_id: slot!.id,
      p_message: null,
    });
    if (applyError || !appId) throw new Error(`지원 실패: ${applyError?.message}`);

    const { error: approveError } = await leader.rpc("approve_application", { p_application_id: appId });
    if (approveError) throw new Error(`승인 실패: ${approveError.message}`);

    chatRoomId = await getChatRoomId(partyId);
  });

  afterEach(async () => {
    await deleteActivity(activityId);
  });

  it("승인 즉시 멤버는 채팅 조회/전송이 가능하고, 합류 시스템 메시지가 남는다", async () => {
    const member = await signInAs(TEST_USERS.student2.email);

    const { data: systemMessages, error: selectError } = await member
      .from("chat_messages")
      .select("id, message_type, body, sender_id")
      .eq("chat_room_id", chatRoomId)
      .eq("message_type", "system");
    expect(selectError).toBeNull();
    expect(systemMessages?.some((m) => m.body.includes("합류"))).toBe(true);

    const { data: msgId, error: sendError } = await member.rpc("send_chat_message", {
      p_chat_room_id: chatRoomId,
      p_client_message_id: "test-msg-1",
      p_body: "안녕하세요",
    });
    expect(sendError).toBeNull();
    expect(msgId).toBeTruthy();
  });

  it("다른 팀의 멤버는 채팅방을 조회·전송할 수 없다", async () => {
    const outsider = await signInAs(TEST_USERS.student3.email);

    const { data: seen, error: selectError } = await outsider
      .from("chat_messages")
      .select("id")
      .eq("chat_room_id", chatRoomId);
    expect(selectError).toBeNull();
    expect(seen?.length ?? 0).toBe(0);

    const { error: sendError } = await outsider.rpc("send_chat_message", {
      p_chat_room_id: chatRoomId,
      p_client_message_id: "outsider-msg-1",
      p_body: "끼어들기 시도",
    });
    expect(sendError).not.toBeNull();
    expect(sendError!.message).toMatch(/NOT_A_MEMBER/);

    // 직접 테이블 INSERT 우회도 막혀야 한다(함수 경유 강제).
    const { error: directInsertError } = await outsider
      .from("chat_messages")
      .insert({ chat_room_id: chatRoomId, sender_id: TEST_USERS.student3.id, body: "직접 삽입 시도" });
    expect(directInsertError).not.toBeNull();
  });

  it("탈퇴 직후에는 조회·전송이 모두 거부된다", async () => {
    const member = await signInAs(TEST_USERS.student2.email);

    const { error: leaveError } = await member.rpc("leave_party", { p_party_id: partyId });
    expect(leaveError).toBeNull();

    const { data: seen, error: selectError } = await member
      .from("chat_messages")
      .select("id")
      .eq("chat_room_id", chatRoomId);
    expect(selectError).toBeNull();
    expect(seen?.length ?? 0).toBe(0);

    const { error: sendError } = await member.rpc("send_chat_message", {
      p_chat_room_id: chatRoomId,
      p_client_message_id: "after-leave-1",
      p_body: "탈퇴 후 전송 시도",
    });
    expect(sendError).not.toBeNull();
    expect(sendError!.message).toMatch(/NOT_A_MEMBER/);

    const { error: readError } = await member.rpc("mark_chat_read", {
      p_chat_room_id: chatRoomId,
      p_last_read_message_id: null,
    });
    expect(readError).not.toBeNull();
    expect(readError!.message).toMatch(/NOT_A_MEMBER/);
  });

  it("같은 client_message_id로 재전송해도 1건만 저장된다", async () => {
    const member = await signInAs(TEST_USERS.student2.email);
    const clientMessageId = `dedupe-${Date.now()}`;

    const [res1, res2, res3] = await Promise.all([
      member.rpc("send_chat_message", { p_chat_room_id: chatRoomId, p_client_message_id: clientMessageId, p_body: "재시도 메시지" }),
      member.rpc("send_chat_message", { p_chat_room_id: chatRoomId, p_client_message_id: clientMessageId, p_body: "재시도 메시지" }),
      member.rpc("send_chat_message", { p_chat_room_id: chatRoomId, p_client_message_id: clientMessageId, p_body: "재시도 메시지" }),
    ]);

    expect(res1.error).toBeNull();
    expect(res2.error).toBeNull();
    expect(res3.error).toBeNull();
    const ids = new Set([res1.data, res2.data, res3.data]);
    expect(ids.size).toBe(1);

    const admin = createAdminClient();
    const { data: stored } = await admin
      .from("chat_messages")
      .select("id")
      .eq("chat_room_id", chatRoomId)
      .eq("client_message_id", clientMessageId);
    expect(stored).toHaveLength(1);
  });

  it("빈 메시지·너무 긴 메시지는 거부된다", async () => {
    const member = await signInAs(TEST_USERS.student2.email);

    const { error: emptyError } = await member.rpc("send_chat_message", {
      p_chat_room_id: chatRoomId,
      p_client_message_id: "empty-1",
      p_body: "   ",
    });
    expect(emptyError?.message).toMatch(/EMPTY_MESSAGE/);

    const { error: tooLongError } = await member.rpc("send_chat_message", {
      p_chat_room_id: chatRoomId,
      p_client_message_id: "too-long-1",
      p_body: "a".repeat(2001),
    });
    expect(tooLongError?.message).toMatch(/MESSAGE_TOO_LONG/);
  });

  it("팀장 위임·팀 확정 시에도 시스템 메시지가 남는다", async () => {
    const leader = await signInAs(TEST_USERS.student1.email);

    const { error: delegateError } = await leader.rpc("delegate_leader", {
      p_party_id: partyId,
      p_new_leader_profile_id: TEST_USERS.student2.id,
    });
    expect(delegateError).toBeNull();

    const newLeader = await signInAs(TEST_USERS.student2.email);
    const { error: confirmError } = await newLeader.rpc("confirm_party", { p_party_id: partyId });
    expect(confirmError).toBeNull();

    const admin = createAdminClient();
    const { data: systemMessages } = await admin
      .from("chat_messages")
      .select("body")
      .eq("chat_room_id", chatRoomId)
      .eq("message_type", "system")
      .order("created_at", { ascending: true });

    const bodies = (systemMessages ?? []).map((m) => m.body);
    expect(bodies.some((b) => b.includes("위임"))).toBe(true);
    expect(bodies.some((b) => b.includes("확정"))).toBe(true);
  });
});
