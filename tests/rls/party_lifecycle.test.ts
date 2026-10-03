import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAdminClient, signInAs, TEST_USERS } from "./helpers";

// 3단계 파티 DB 함수(create_party/apply_to_party/approve_application/...)의 트랜잭션·행 잠금
// 보장을 실제 로그인 클라이언트로 검증한다 (architecture.md 4장 핵심 불변식, 완료 기준 10장).

async function createPublishedTeamActivity(title: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("activities")
    .insert({
      title,
      status: "published",
      participation_mode: "team",
      location_type: "offline",
      is_demo: true,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`테스트 활동 생성 실패: ${error?.message}`);
  return data.id as string;
}

async function deleteActivity(activityId: string) {
  const admin = createAdminClient();
  await admin.from("activities").delete().eq("id", activityId);
}

describe("파티 DB 함수 — 동시성/권한", () => {
  let activityId: string;

  beforeEach(async () => {
    activityId = await createPublishedTeamActivity(`테스트 활동 ${Date.now()}-${Math.random().toString(36).slice(2)}`);
  });

  afterEach(async () => {
    await deleteActivity(activityId);
  });

  it("마지막 한 자리에 대한 동시 승인 요청은 1명만 성공한다", async () => {
    const leader = await signInAs(TEST_USERS.student1.email);
    const applicant1 = await signInAs(TEST_USERS.student2.email);
    const applicant2 = await signInAs(TEST_USERS.student3.email);

    const { data: partyId, error: createError } = await leader.rpc("create_party", {
      p_activity_id: activityId,
      p_title: "동시 승인 테스트 파티",
      p_description: null,
      p_capacity: 2, // 팀장 1명 + 지원자 1명만 들어갈 수 있는 정원
      p_meeting_mode: null,
      p_recruit_deadline: null,
    });
    expect(createError).toBeNull();

    const { data: app1Id, error: app1Error } = await applicant1.rpc("apply_to_party", {
      p_party_id: partyId,
      p_message: null,
    });
    const { data: app2Id, error: app2Error } = await applicant2.rpc("apply_to_party", {
      p_party_id: partyId,
      p_message: null,
    });
    expect(app1Error).toBeNull();
    expect(app2Error).toBeNull();

    const [res1, res2] = await Promise.all([
      leader.rpc("approve_application", { p_application_id: app1Id }),
      leader.rpc("approve_application", { p_application_id: app2Id }),
    ]);

    const errors = [res1.error, res2.error];
    const successes = errors.filter((e) => e === null);
    const failures = errors.filter((e) => e !== null);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.message).toContain("PARTY_FULL");

    const admin = createAdminClient();
    const { data: members } = await admin
      .from("party_members")
      .select("profile_id, status")
      .eq("party_id", partyId)
      .eq("status", "active");
    // 팀장 1 + 승인된 지원자 1 = 2명이어야 하고, 정원(2)을 넘지 않는다.
    expect(members).toHaveLength(2);
  });

  it("동일 활동의 두 파티가 동시에 확정되면 1곳만 확정되고 나머지는 자동 정리된다", async () => {
    const leaderA = await signInAs(TEST_USERS.student1.email);
    const leaderB = await signInAs(TEST_USERS.student2.email);
    const contested = await signInAs(TEST_USERS.student3.email);

    const { data: partyAId } = await leaderA.rpc("create_party", {
      p_activity_id: activityId,
      p_title: "파티 A",
      p_description: null,
      p_capacity: 2,
      p_meeting_mode: null,
      p_recruit_deadline: null,
    });
    const { data: partyBId } = await leaderB.rpc("create_party", {
      p_activity_id: activityId,
      p_title: "파티 B",
      p_description: null,
      p_capacity: 2,
      p_meeting_mode: null,
      p_recruit_deadline: null,
    });

    // student3가 두 파티 모두에 지원 → 승인(아직 confirm 전이므로 둘 다 허용됨, 5.2절).
    const { data: appAId } = await contested.rpc("apply_to_party", { p_party_id: partyAId, p_message: null });
    const { data: appBId } = await contested.rpc("apply_to_party", { p_party_id: partyBId, p_message: null });
    const approveA = await leaderA.rpc("approve_application", { p_application_id: appAId });
    const approveB = await leaderB.rpc("approve_application", { p_application_id: appBId });
    expect(approveA.error).toBeNull();
    expect(approveB.error).toBeNull();

    const [confirmA, confirmB] = await Promise.all([
      leaderA.rpc("confirm_party", { p_party_id: partyAId }),
      leaderB.rpc("confirm_party", { p_party_id: partyBId }),
    ]);
    // 두 confirm 모두 "에러로 중단"되지는 않는다 — 충돌한 쪽은 해당 멤버만 자동 제거하고 정상 완료된다.
    expect(confirmA.error).toBeNull();
    expect(confirmB.error).toBeNull();

    const admin = createAdminClient();
    const { data: memberships } = await admin
      .from("party_members")
      .select("party_id, status, is_confirmed")
      .eq("profile_id", TEST_USERS.student3.id)
      .in("party_id", [partyAId, partyBId]);

    const confirmed = memberships!.filter((m) => m.is_confirmed && m.status === "active");
    const removed = memberships!.filter((m) => m.status === "removed");
    expect(confirmed).toHaveLength(1);
    expect(removed).toHaveLength(1);

    // 둘 중 하나의 confirm_party 결과에 removed_due_to_conflict로 해당 사용자가 기록되어 있어야 한다.
    const removedLists = [confirmA.data?.removed_due_to_conflict ?? [], confirmB.data?.removed_due_to_conflict ?? []];
    expect(removedLists.flat()).toContain(TEST_USERS.student3.id);
  });

  it("팀장이 아닌 사용자의 승인·위임 요청은 거부된다", async () => {
    const leader = await signInAs(TEST_USERS.student1.email);
    const notLeader = await signInAs(TEST_USERS.student2.email);
    const applicant = await signInAs(TEST_USERS.student3.email);

    const { data: partyId } = await leader.rpc("create_party", {
      p_activity_id: activityId,
      p_title: "권한 테스트 파티",
      p_description: null,
      p_capacity: 3,
      p_meeting_mode: null,
      p_recruit_deadline: null,
    });
    const { data: appId } = await applicant.rpc("apply_to_party", { p_party_id: partyId, p_message: null });

    const approveAttempt = await notLeader.rpc("approve_application", { p_application_id: appId });
    expect(approveAttempt.error).not.toBeNull();
    expect(approveAttempt.error!.message).toContain("NOT_LEADER");

    const delegateAttempt = await notLeader.rpc("delegate_leader", {
      p_party_id: partyId,
      p_new_leader_profile_id: TEST_USERS.student3.id,
    });
    expect(delegateAttempt.error).not.toBeNull();
    expect(delegateAttempt.error!.message).toContain("NOT_LEADER");
  });

  it("탈퇴하면 즉시 파티 멤버십(채팅 접근 권한의 근거)을 잃는다", async () => {
    const leader = await signInAs(TEST_USERS.student1.email);
    const member = await signInAs(TEST_USERS.student2.email);

    const { data: partyId } = await leader.rpc("create_party", {
      p_activity_id: activityId,
      p_title: "탈퇴 테스트 파티",
      p_description: null,
      p_capacity: 3,
      p_meeting_mode: null,
      p_recruit_deadline: null,
    });
    const { data: appId } = await member.rpc("apply_to_party", { p_party_id: partyId, p_message: null });
    await leader.rpc("approve_application", { p_application_id: appId });

    const { data: beforeLeave } = await member.rpc("is_party_member", { p_party_id: partyId });
    expect(beforeLeave).toBe(true);

    const { error: leaveError } = await member.rpc("leave_party", { p_party_id: partyId });
    expect(leaveError).toBeNull();

    const { data: afterLeave } = await member.rpc("is_party_member", { p_party_id: partyId });
    expect(afterLeave).toBe(false);
  });
});
