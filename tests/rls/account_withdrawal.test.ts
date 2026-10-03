import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient, signInAs, TEST_USERS } from "./helpers";
import { parseDbError } from "@/lib/errors";

// 5-A단계(회원 탈퇴): withdraw_account()를 검증한다. student4는 다른 테스트 파일이 거의 쓰지
// 않는 계정이라 탈퇴 대상으로 쓰고, 끝나면 admin 클라이언트로 프로필 상태를 "active"로 복원해
// 이후 테스트 파일(다른 파일들도 student4를 가끔 쓴다)에 영향을 주지 않게 한다.

const WITHDRAWING_USER = TEST_USERS.student4;

async function restoreWithdrawingUserProfile() {
  const admin = createAdminClient();
  await admin
    .from("profiles")
    .update({
      nickname: "마케터하늘",
      account_status: "active",
      bio: "주말에만 참여 가능합니다.",
      preferred_location_type: "hybrid",
      preferred_region: "서울/온라인",
      weekly_available_hours: 3,
      matching_opt_in: true,
      notifications_enabled: true,
    })
    .eq("id", WITHDRAWING_USER.id);
  // seed.sql이 심어둔 가능 시간(토/일 종일)을 복원한다 — withdraw_account가 전부 지우므로.
  await admin.from("availability_slots").delete().eq("profile_id", WITHDRAWING_USER.id);
  await admin.from("availability_slots").insert([
    { profile_id: WITHDRAWING_USER.id, day_of_week: 6, start_time: "09:00", end_time: "18:00" },
    { profile_id: WITHDRAWING_USER.id, day_of_week: 0, start_time: "09:00", end_time: "18:00" },
  ]);
  // withdraw_account()는 본인의 "모든" 활성 파티 멤버십을 정리하므로, 테스트 중 실제로 탈퇴를
  // 실행하면 seed.sql이 만들어 둔 영구 데모 파티(student3 팀장 + student4 팀원 확정팀)의
  // 멤버십도 'left'가 된다 — 테스트가 만든 파티는 activities 삭제로 cascade 정리되지만, 이
  // seed 파티는 다른 테스트 파일(cross_user.test.ts)이 "2명 다 활성 멤버"를 전제하므로 되돌린다.
  await admin.from("party_members").update({ status: "active" }).eq("profile_id", WITHDRAWING_USER.id).eq("status", "left");
}

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

describe("회원 탈퇴", () => {
  afterEach(async () => {
    await restoreWithdrawingUserProfile();
  });

  it("팀장으로 있고 다른 팀원이 있으면 탈퇴가 거부된다", async () => {
    const activityId = await createPublishedTeamActivity(`탈퇴차단-팀장 ${Date.now()}`);
    try {
      const leader = await signInAs(WITHDRAWING_USER.email);
      const member = await signInAs(TEST_USERS.student1.email);

      const { data: partyId } = await leader.rpc("create_party", {
        p_activity_id: activityId, p_title: "탈퇴 차단 테스트 파티", p_description: null, p_meeting_mode: null,
        p_recruit_deadline: null,
        p_role_slots: [{ role_name: "기획", capacity: 1 }, { role_name: "개발", capacity: 1 }],
        p_leader_role_name: "기획",
      });
      const admin = createAdminClient();
      const { data: slot } = await admin.from("party_role_slots").select("id").eq("party_id", partyId).eq("role_name", "개발").single();
      const { data: appId } = await member.rpc("apply_to_party", { p_party_id: partyId, p_role_slot_id: slot!.id, p_message: null });
      await leader.rpc("approve_application", { p_application_id: appId });

      const { error } = await leader.rpc("withdraw_account");
      expect(error).not.toBeNull();
      expect(parseDbError(error, "").code).toBe("LEADER_MUST_RESOLVE_PARTY_FIRST");

      const { data: profile } = await admin.from("profiles").select("account_status").eq("id", WITHDRAWING_USER.id).single();
      expect(profile!.account_status).toBe("active");
    } finally {
      await deleteActivity(activityId);
    }
  });

  it("탈퇴하면 프로필이 비식별화되고, 대기열·지원·파티 멤버십이 정리된다", async () => {
    const partyActivityId = await createPublishedTeamActivity(`탈퇴-일반멤버 ${Date.now()}`);
    const queueActivityId = await createPublishedTeamActivity(`탈퇴-매칭대기 ${Date.now()}`);
    const admin = createAdminClient();

    try {
      const withdrawing = await signInAs(WITHDRAWING_USER.email);
      const leader = await signInAs(TEST_USERS.student1.email);

      // 1) 일반 멤버로 참여 중인 파티
      const { data: partyId } = await leader.rpc("create_party", {
        p_activity_id: partyActivityId, p_title: "탈퇴 전 소속 파티", p_description: null, p_meeting_mode: null,
        p_recruit_deadline: null,
        p_role_slots: [{ role_name: "기획", capacity: 1 }, { role_name: "개발", capacity: 1 }],
        p_leader_role_name: "기획",
      });
      const { data: slot } = await admin.from("party_role_slots").select("id").eq("party_id", partyId).eq("role_name", "개발").single();
      const { data: appId } = await withdrawing.rpc("apply_to_party", { p_party_id: partyId, p_role_slot_id: slot!.id, p_message: null });
      await leader.rpc("approve_application", { p_application_id: appId });

      // 2) 다른 파티에 대기 중인 지원(아직 승인 안 됨)
      const pendingActivityId = await createPublishedTeamActivity(`탈퇴-대기지원 ${Date.now()}`);
      const { data: pendingPartyId } = await leader.rpc("create_party", {
        p_activity_id: pendingActivityId, p_title: "대기 지원용 파티", p_description: null, p_meeting_mode: null,
        p_recruit_deadline: null,
        p_role_slots: [{ role_name: "역할", capacity: 2 }],
        p_leader_role_name: "역할",
      });
      const { data: pendingSlot } = await admin.from("party_role_slots").select("id").eq("party_id", pendingPartyId).single();
      const { data: pendingAppId } = await withdrawing.rpc("apply_to_party", {
        p_party_id: pendingPartyId, p_role_slot_id: pendingSlot!.id, p_message: null,
      });

      // 3) 매칭 대기열에 참가
      const { data: template } = await admin
        .from("activity_match_templates")
        .insert({ activity_id: queueActivityId, name: "탈퇴 테스트 템플릿" })
        .select("id")
        .single();
      await admin.from("activity_match_template_roles").insert({ template_id: template!.id, role_name: "개발", capacity: 1 });
      const { data: queueId, error: joinError } = await withdrawing.rpc("join_matching_queue", {
        p_activity_id: queueActivityId, p_template_id: template!.id,
        p_eligible_roles: ["개발"], p_willing_leader: false, p_continue_on_fail: true,
      });
      expect(joinError).toBeNull();

      // 탈퇴 실행
      const { error: withdrawError } = await withdrawing.rpc("withdraw_account");
      expect(withdrawError).toBeNull();

      // 프로필 비식별화 확인
      const { data: profile } = await admin
        .from("profiles")
        .select("nickname, account_status, bio")
        .eq("id", WITHDRAWING_USER.id)
        .single();
      expect(profile!.nickname).toBe("탈퇴한 사용자");
      expect(profile!.account_status).toBe("withdrawn");
      expect(profile!.bio).toBeNull();

      // 파티 멤버십이 'left'로 정리됨
      const { data: memberRow } = await admin
        .from("party_members")
        .select("status")
        .eq("party_id", partyId)
        .eq("profile_id", WITHDRAWING_USER.id)
        .single();
      expect(memberRow!.status).toBe("left");

      // 채팅 시스템 메시지가 "탈퇴한 사용자"로 남는다(프로필 nickname이 바뀌었으므로 자동 반영).
      const { data: room } = await admin.from("chat_rooms").select("id").eq("party_id", partyId).single();
      const { data: systemMessages } = await admin
        .from("chat_messages")
        .select("body")
        .eq("chat_room_id", room!.id)
        .eq("message_type", "system")
        .order("created_at", { ascending: false })
        .limit(1);
      expect(systemMessages![0]!.body).toContain("탈퇴한 사용자님이 파티를 탈퇴했어요");

      // 대기 중이던 지원은 취소됨
      const { data: pendingApp } = await admin.from("party_applications").select("status").eq("id", pendingAppId).single();
      expect(pendingApp!.status).toBe("cancelled");

      // 매칭 대기열은 취소됨
      const { data: queueRow } = await admin.from("matching_queue").select("status").eq("id", queueId).single();
      expect(queueRow!.status).toBe("cancelled");

      // 탈퇴 후에는 쓰기 동작도 거부된다(계정 정지와 동일한 트리거 경로).
      const { error: postWithdrawError } = await withdrawing.rpc("apply_to_party", {
        p_party_id: pendingPartyId, p_role_slot_id: pendingSlot!.id, p_message: null,
      });
      expect(postWithdrawError).not.toBeNull();
      expect(parseDbError(postWithdrawError, "").code).toBe("ACCOUNT_WITHDRAWN");

      await deleteActivity(pendingActivityId);
    } finally {
      await deleteActivity(partyActivityId);
      await deleteActivity(queueActivityId);
    }
  });

  it("이미 탈퇴한 계정은 다시 탈퇴를 요청할 수 없다", async () => {
    const admin = createAdminClient();
    await admin.from("profiles").update({ account_status: "withdrawn", nickname: "탈퇴한 사용자" }).eq("id", WITHDRAWING_USER.id);

    const withdrawing = await signInAs(WITHDRAWING_USER.email);
    const { error } = await withdrawing.rpc("withdraw_account");
    expect(error).not.toBeNull();
    expect(parseDbError(error, "").code).toBe("ALREADY_WITHDRAWN");
  });

  it("정지된 계정도 탈퇴할 수 있다(탈퇴는 추가 권한이 아니라 자기 정리)", async () => {
    const admin = createAdminClient();
    await admin.from("profiles").update({ account_status: "suspended" }).eq("id", WITHDRAWING_USER.id);

    const withdrawing = await signInAs(WITHDRAWING_USER.email);
    const { error } = await withdrawing.rpc("withdraw_account");
    expect(error).toBeNull();

    const { data: profile } = await admin.from("profiles").select("account_status").eq("id", WITHDRAWING_USER.id).single();
    expect(profile!.account_status).toBe("withdrawn");
  });
});
