import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAdminClient, signInAs, TEST_USERS } from "./helpers";

// 3단계 파티 DB 함수(create_party/apply_to_party/approve_application/...)의 트랜잭션·행 잠금
// 보장을 실제 로그인 클라이언트로 검증한다 (architecture.md 4장 핵심 불변식, 완료 기준 10장).
// 3단계 보완: 역할 슬롯 정원과 "활동당 활성 멤버 1파티" 규칙도 함께 검증한다.

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

async function getRoleSlotId(partyId: string, roleName: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("party_role_slots")
    .select("id")
    .eq("party_id", partyId)
    .eq("role_name", roleName)
    .single();
  return data!.id as string;
}

describe("파티 DB 함수 — 동시성/권한", () => {
  let activityId: string;

  beforeEach(async () => {
    activityId = await createPublishedTeamActivity(`테스트 활동 ${Date.now()}-${Math.random().toString(36).slice(2)}`);
  });

  afterEach(async () => {
    await deleteActivity(activityId);
  });

  it("같은 역할의 마지막 슬롯에 동시 승인 2건이 들어와도 1명만 성공한다", async () => {
    const leader = await signInAs(TEST_USERS.student1.email);
    const applicant1 = await signInAs(TEST_USERS.student2.email);
    const applicant2 = await signInAs(TEST_USERS.student3.email);

    const { data: partyId, error: createError } = await leader.rpc("create_party", {
      p_activity_id: activityId,
      p_title: "동시 승인 테스트 파티",
      p_description: null,
      p_meeting_mode: null,
      p_recruit_deadline: null,
      p_role_slots: [
        { role_name: "기획", capacity: 1 },
        { role_name: "개발", capacity: 1 }, // 마지막 한 자리
      ],
      p_leader_role_name: "기획",
    });
    expect(createError).toBeNull();

    const devSlotId = await getRoleSlotId(partyId, "개발");

    const { data: app1Id, error: app1Error } = await applicant1.rpc("apply_to_party", {
      p_party_id: partyId,
      p_role_slot_id: devSlotId,
      p_message: null,
    });
    const { data: app2Id, error: app2Error } = await applicant2.rpc("apply_to_party", {
      p_party_id: partyId,
      p_role_slot_id: devSlotId,
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
    expect(failures[0]!.message).toMatch(/ROLE_SLOT_FULL|PARTY_FULL/);

    const admin = createAdminClient();
    const { data: members } = await admin
      .from("party_members")
      .select("profile_id, status, role_slot_id")
      .eq("party_id", partyId)
      .eq("status", "active");
    // 팀장 1 + 승인된 지원자 1 = 2명. 개발 역할 슬롯(정원 1)을 초과하지 않는다.
    expect(members).toHaveLength(2);
    expect(members!.filter((m) => m.role_slot_id === devSlotId)).toHaveLength(1);
  });

  it("같은 활동 두 파티의 동시 승인 시 한 곳만 성공하고 나머지 지원은 superseded 처리된다", async () => {
    const leaderA = await signInAs(TEST_USERS.student1.email);
    const leaderB = await signInAs(TEST_USERS.student2.email);
    const contested = await signInAs(TEST_USERS.student3.email);

    const { data: partyAId } = await leaderA.rpc("create_party", {
      p_activity_id: activityId,
      p_title: "파티 A",
      p_description: null,
      p_meeting_mode: null,
      p_recruit_deadline: null,
      p_role_slots: [
        { role_name: "기획", capacity: 1 },
        { role_name: "개발", capacity: 1 },
      ],
      p_leader_role_name: "기획",
    });
    const { data: partyBId } = await leaderB.rpc("create_party", {
      p_activity_id: activityId,
      p_title: "파티 B",
      p_description: null,
      p_meeting_mode: null,
      p_recruit_deadline: null,
      p_role_slots: [
        { role_name: "기획", capacity: 1 },
        { role_name: "개발", capacity: 1 },
      ],
      p_leader_role_name: "기획",
    });

    const devSlotA = await getRoleSlotId(partyAId, "개발");
    const devSlotB = await getRoleSlotId(partyBId, "개발");

    // student3가 두 파티 모두에 지원 → 둘 다 아직 pending 상태로 허용된다 (확정 전까지는 중복 지원 가능, 5.2절).
    const { data: appAId } = await contested.rpc("apply_to_party", {
      p_party_id: partyAId,
      p_role_slot_id: devSlotA,
      p_message: null,
    });
    const { data: appBId } = await contested.rpc("apply_to_party", {
      p_party_id: partyBId,
      p_role_slot_id: devSlotB,
      p_message: null,
    });
    expect(appAId).toBeTruthy();
    expect(appBId).toBeTruthy();

    const [approveA, approveB] = await Promise.all([
      leaderA.rpc("approve_application", { p_application_id: appAId }),
      leaderB.rpc("approve_application", { p_application_id: appBId }),
    ]);

    // 둘 중 하나는 성공(활성 멤버가 됨)하고, 나머지는 거부되거나(ALREADY_ACTIVE_IN_ACTIVITY)
    // 먼저 승인된 쪽 때문에 자동으로 superseded 처리된 뒤 실패(APPLICATION_SUPERSEDED)한다.
    const outcomes = [approveA, approveB];
    const succeeded = outcomes.filter((o) => o.error === null);
    const failed = outcomes.filter((o) => o.error !== null);
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0]!.error!.message).toMatch(/APPLICATION_SUPERSEDED|ALREADY_ACTIVE_IN_ACTIVITY/);

    const admin = createAdminClient();
    const { data: memberships } = await admin
      .from("party_members")
      .select("party_id, status")
      .eq("profile_id", TEST_USERS.student3.id)
      .in("party_id", [partyAId, partyBId])
      .eq("status", "active");
    // 활성 멤버는 정확히 한 파티에만 존재한다.
    expect(memberships).toHaveLength(1);

    const { data: applications } = await admin
      .from("party_applications")
      .select("id, status")
      .in("id", [appAId, appBId]);
    const statuses = applications!.map((a) => a.status).sort();
    // 하나는 approved, 다른 하나는 superseded여야 한다 (한쪽이 승인되는 즉시 나머지는 자동 종료).
    expect(statuses).toEqual(["approved", "superseded"]);
  });

  it("정원이 찬 역할에는 지원할 수 없다", async () => {
    const leader = await signInAs(TEST_USERS.student1.email);
    const filler = await signInAs(TEST_USERS.student2.email);
    const rejected = await signInAs(TEST_USERS.student3.email);

    const { data: partyId } = await leader.rpc("create_party", {
      p_activity_id: activityId,
      p_title: "역할 정원 테스트",
      p_description: null,
      p_meeting_mode: null,
      p_recruit_deadline: null,
      p_role_slots: [
        { role_name: "기획", capacity: 1 },
        { role_name: "디자인", capacity: 1 },
        { role_name: "개발", capacity: 2 }, // 디자인 슬롯이 차도 파티 전체는 여전히 모집 중이도록 여유를 둔다.
      ],
      p_leader_role_name: "기획",
    });
    const designSlotId = await getRoleSlotId(partyId, "디자인");

    const { data: fillerAppId } = await filler.rpc("apply_to_party", {
      p_party_id: partyId,
      p_role_slot_id: designSlotId,
      p_message: null,
    });
    const { error: approveError } = await leader.rpc("approve_application", { p_application_id: fillerAppId });
    expect(approveError).toBeNull();

    const { error: applyError } = await rejected.rpc("apply_to_party", {
      p_party_id: partyId,
      p_role_slot_id: designSlotId,
      p_message: null,
    });
    expect(applyError).not.toBeNull();
    expect(applyError!.message).toContain("ROLE_SLOT_FULL");
  });

  it("팀장이 아닌 사용자의 승인·위임·수정 요청은 거부된다", async () => {
    const leader = await signInAs(TEST_USERS.student1.email);
    const notLeader = await signInAs(TEST_USERS.student2.email);
    const applicant = await signInAs(TEST_USERS.student3.email);

    const { data: partyId } = await leader.rpc("create_party", {
      p_activity_id: activityId,
      p_title: "권한 테스트 파티",
      p_description: null,
      p_meeting_mode: null,
      p_recruit_deadline: null,
      p_role_slots: [
        { role_name: "기획", capacity: 1 },
        { role_name: "개발", capacity: 2 },
      ],
      p_leader_role_name: "기획",
    });
    const devSlotId = await getRoleSlotId(partyId, "개발");
    const { data: appId } = await applicant.rpc("apply_to_party", {
      p_party_id: partyId,
      p_role_slot_id: devSlotId,
      p_message: null,
    });

    const approveAttempt = await notLeader.rpc("approve_application", { p_application_id: appId });
    expect(approveAttempt.error).not.toBeNull();
    expect(approveAttempt.error!.message).toContain("NOT_LEADER");

    const delegateAttempt = await notLeader.rpc("delegate_leader", {
      p_party_id: partyId,
      p_new_leader_profile_id: TEST_USERS.student3.id,
    });
    expect(delegateAttempt.error).not.toBeNull();
    expect(delegateAttempt.error!.message).toContain("NOT_LEADER");

    const updateAttempt = await notLeader.rpc("update_party_details", {
      p_party_id: partyId,
      p_title: "해킹된 제목",
      p_description: null,
      p_meeting_mode: null,
      p_recruit_deadline: null,
      p_required_common_time: null,
      p_role_slot_capacities: null,
    });
    expect(updateAttempt.error).not.toBeNull();
    expect(updateAttempt.error!.message).toContain("NOT_LEADER");
  });

  it("탈퇴하면 즉시 파티 멤버십(채팅 접근 권한의 근거)을 잃는다", async () => {
    const leader = await signInAs(TEST_USERS.student1.email);
    const member = await signInAs(TEST_USERS.student2.email);

    const { data: partyId } = await leader.rpc("create_party", {
      p_activity_id: activityId,
      p_title: "탈퇴 테스트 파티",
      p_description: null,
      p_meeting_mode: null,
      p_recruit_deadline: null,
      p_role_slots: [
        { role_name: "기획", capacity: 1 },
        { role_name: "개발", capacity: 2 },
      ],
      p_leader_role_name: "기획",
    });
    const devSlotId = await getRoleSlotId(partyId, "개발");
    const { data: appId } = await member.rpc("apply_to_party", {
      p_party_id: partyId,
      p_role_slot_id: devSlotId,
      p_message: null,
    });
    await leader.rpc("approve_application", { p_application_id: appId });

    const { data: beforeLeave } = await member.rpc("is_party_member", { p_party_id: partyId });
    expect(beforeLeave).toBe(true);

    const { error: leaveError } = await member.rpc("leave_party", { p_party_id: partyId });
    expect(leaveError).toBeNull();

    const { data: afterLeave } = await member.rpc("is_party_member", { p_party_id: partyId });
    expect(afterLeave).toBe(false);
  });

  it("팀장은 역할 정원을 늘릴 수 있지만 현재 인원보다 줄일 수는 없다", async () => {
    const leader = await signInAs(TEST_USERS.student1.email);
    const member = await signInAs(TEST_USERS.student2.email);

    const { data: partyId } = await leader.rpc("create_party", {
      p_activity_id: activityId,
      p_title: "정보 수정 테스트 파티",
      p_description: "원래 소개",
      p_meeting_mode: "online",
      p_recruit_deadline: null,
      p_role_slots: [
        { role_name: "기획", capacity: 1 },
        { role_name: "개발", capacity: 1 },
      ],
      p_leader_role_name: "기획",
    });
    const devSlotId = await getRoleSlotId(partyId, "개발");
    const { data: appId } = await member.rpc("apply_to_party", {
      p_party_id: partyId,
      p_role_slot_id: devSlotId,
      p_message: null,
    });
    await leader.rpc("approve_application", { p_application_id: appId });

    // 현재 인원(1명)보다 적게 줄이려 하면 거부된다.
    const shrinkAttempt = await leader.rpc("update_party_details", {
      p_party_id: partyId,
      p_title: "정보 수정 테스트 파티",
      p_description: "원래 소개",
      p_meeting_mode: "online",
      p_recruit_deadline: null,
      p_required_common_time: null,
      p_role_slot_capacities: [{ role_slot_id: devSlotId, capacity: 0 }],
    });
    expect(shrinkAttempt.error).not.toBeNull();

    // 늘리는 것은 허용된다.
    const growAttempt = await leader.rpc("update_party_details", {
      p_party_id: partyId,
      p_title: "정보 수정 테스트 파티(수정됨)",
      p_description: "수정된 소개",
      p_meeting_mode: "offline",
      p_recruit_deadline: null,
      p_required_common_time: { days: ["mon", "wed"] },
      p_role_slot_capacities: [{ role_slot_id: devSlotId, capacity: 2 }],
    });
    expect(growAttempt.error).toBeNull();

    const admin = createAdminClient();
    const { data: party } = await admin
      .from("parties")
      .select("title, description, meeting_mode, capacity")
      .eq("id", partyId)
      .single();
    expect(party!.title).toBe("정보 수정 테스트 파티(수정됨)");
    expect(party!.meeting_mode).toBe("offline");
    expect(party!.capacity).toBe(3); // 기획 1 + 개발(늘린) 2
  });
});
