import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient, signInAs, TEST_USERS } from "./helpers";

// 4-B단계: 빠른 매칭 DB 함수·워커의 트랜잭션·동시성 보장을 실제 로그인 클라이언트로 검증한다
// (architecture.md 12장, 지시서 7장 B "검증" 요구사항).
//
// student1/student2는 seed.sql 기준 월요일 10-12시가 겹치고(student1 09-12, student2 10-12),
// student1/student3(student4 계정, id ...004)는 수요일 19-21시가 겹친다(student1 19-21, student3 18-22).
// 두 쌍 모두 기존 가능 시간 데이터를 그대로 재사용해 추가 availability_slots를 만들지 않는다.

async function createMatchActivity(title: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("activities")
    .insert({ title, status: "published", participation_mode: "team", location_type: "offline", is_demo: true })
    .select("id")
    .single();
  if (error || !data) throw new Error(`테스트 활동 생성 실패: ${error?.message}`);
  return data.id as string;
}

async function createTemplate(activityId: string, roles: { roleName: string; capacity: number }[]) {
  const admin = createAdminClient();
  const { data: template, error } = await admin
    .from("activity_match_templates")
    .insert({ activity_id: activityId, name: "테스트 템플릿" })
    .select("id")
    .single();
  if (error || !template) throw new Error(`템플릿 생성 실패: ${error?.message}`);
  const { error: rolesError } = await admin
    .from("activity_match_template_roles")
    .insert(roles.map((r) => ({ template_id: template.id, role_name: r.roleName, capacity: r.capacity })));
  if (rolesError) throw new Error(`템플릿 역할 생성 실패: ${rolesError.message}`);
  return template.id as string;
}

async function deleteActivity(activityId: string) {
  const admin = createAdminClient();
  await admin.from("activities").delete().eq("id", activityId);
}

async function runWorker(asOf?: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("run_match_worker", { p_as_of: asOf ?? new Date().toISOString() });
  if (error) throw new Error(`워커 실행 실패: ${error.message}`);
  return data as { expired_proposals: number; new_proposals: number; bookmark_notifications_checked: number };
}

describe("빠른 매칭 — DB 함수/워커", () => {
  let activityId: string;

  afterEach(async () => {
    if (activityId) await deleteActivity(activityId);
  });

  it("매칭 성공 → 전원 수락 → 파티와 채팅방이 정확히 1개만 생성된다", async () => {
    activityId = await createMatchActivity(`매칭 성공 테스트 ${Date.now()}`);
    const templateId = await createTemplate(activityId, [
      { roleName: "기획", capacity: 1 },
      { roleName: "개발", capacity: 1 },
    ]);

    const student1 = await signInAs(TEST_USERS.student1.email);
    const student2 = await signInAs(TEST_USERS.student2.email);

    const { error: join1Error } = await student1.rpc("join_matching_queue", {
      p_activity_id: activityId,
      p_template_id: templateId,
      p_eligible_roles: ["기획"],
      p_willing_leader: true,
      p_continue_on_fail: true,
    });
    expect(join1Error).toBeNull();

    const { error: join2Error } = await student2.rpc("join_matching_queue", {
      p_activity_id: activityId,
      p_template_id: templateId,
      p_eligible_roles: ["개발"],
      p_willing_leader: false,
      p_continue_on_fail: true,
    });
    expect(join2Error).toBeNull();

    const result = await runWorker();
    expect(result.new_proposals).toBe(1);

    const admin = createAdminClient();
    const { data: proposals } = await admin.from("match_proposals").select("id, status").eq("activity_id", activityId);
    expect(proposals).toHaveLength(1);
    const proposalId = proposals![0]!.id as string;

    await student1.rpc("respond_to_match_proposal", { p_proposal_id: proposalId, p_accept: true });
    await student2.rpc("respond_to_match_proposal", { p_proposal_id: proposalId, p_accept: true });

    const { data: finalProposal } = await admin.from("match_proposals").select("status, party_id").eq("id", proposalId).single();
    expect(finalProposal?.status).toBe("matched");
    expect(finalProposal?.party_id).toBeTruthy();

    const { data: parties } = await admin.from("parties").select("id").eq("activity_id", activityId).eq("source", "matching");
    expect(parties).toHaveLength(1);

    const { data: chatRooms } = await admin.from("chat_rooms").select("id").eq("party_id", finalProposal!.party_id);
    expect(chatRooms).toHaveLength(1);

    const { data: members } = await admin.from("party_members").select("profile_id, status, is_confirmed").eq("party_id", finalProposal!.party_id);
    expect(members).toHaveLength(2);
    expect(members!.every((m) => m.status === "active" && m.is_confirmed)).toBe(true);
  });

  it("마지막 두 명이 동시에 수락해도 파티는 1개만 생긴다", async () => {
    activityId = await createMatchActivity(`동시 수락 테스트 ${Date.now()}`);
    const templateId = await createTemplate(activityId, [
      { roleName: "기획", capacity: 1 },
      { roleName: "개발", capacity: 1 },
    ]);

    const student1 = await signInAs(TEST_USERS.student1.email);
    const student2 = await signInAs(TEST_USERS.student2.email);

    await student1.rpc("join_matching_queue", {
      p_activity_id: activityId, p_template_id: templateId, p_eligible_roles: ["기획"],
      p_willing_leader: true, p_continue_on_fail: false,
    });
    await student2.rpc("join_matching_queue", {
      p_activity_id: activityId, p_template_id: templateId, p_eligible_roles: ["개발"],
      p_willing_leader: false, p_continue_on_fail: false,
    });
    await runWorker();

    const admin = createAdminClient();
    const { data: proposal } = await admin.from("match_proposals").select("id").eq("activity_id", activityId).single();

    const [res1, res2] = await Promise.all([
      student1.rpc("respond_to_match_proposal", { p_proposal_id: proposal!.id, p_accept: true }),
      student2.rpc("respond_to_match_proposal", { p_proposal_id: proposal!.id, p_accept: true }),
    ]);
    expect(res1.error).toBeNull();
    expect(res2.error).toBeNull();

    const { data: parties } = await admin.from("parties").select("id").eq("activity_id", activityId).eq("source", "matching");
    expect(parties).toHaveLength(1);
  });

  it("워커를 동시에 두 번 실행해도 같은 그룹에 중복 제안이 생기지 않는다", async () => {
    activityId = await createMatchActivity(`워커 동시 실행 테스트 ${Date.now()}`);
    const templateId = await createTemplate(activityId, [
      { roleName: "기획", capacity: 1 },
      { roleName: "개발", capacity: 1 },
    ]);

    const student1 = await signInAs(TEST_USERS.student1.email);
    const student2 = await signInAs(TEST_USERS.student2.email);
    await student1.rpc("join_matching_queue", {
      p_activity_id: activityId, p_template_id: templateId, p_eligible_roles: ["기획"],
      p_willing_leader: true, p_continue_on_fail: false,
    });
    await student2.rpc("join_matching_queue", {
      p_activity_id: activityId, p_template_id: templateId, p_eligible_roles: ["개발"],
      p_willing_leader: false, p_continue_on_fail: false,
    });

    await Promise.all([runWorker(), runWorker()]);

    const admin = createAdminClient();
    const { data: proposals } = await admin.from("match_proposals").select("id").eq("activity_id", activityId);
    expect(proposals).toHaveLength(1);
  });

  it("한 명이 거절하면 제안이 해제되고, 계속 찾기에 동의한 사람만 다시 대기한다", async () => {
    activityId = await createMatchActivity(`거절 테스트 ${Date.now()}`);
    const templateId = await createTemplate(activityId, [
      { roleName: "기획", capacity: 1 },
      { roleName: "개발", capacity: 1 },
    ]);

    const student1 = await signInAs(TEST_USERS.student1.email); // continue_on_fail = true
    const student2 = await signInAs(TEST_USERS.student2.email); // continue_on_fail = false, 거절할 사람

    const { data: queue1 } = await student1.rpc("join_matching_queue", {
      p_activity_id: activityId, p_template_id: templateId, p_eligible_roles: ["기획"],
      p_willing_leader: true, p_continue_on_fail: true,
    });
    const { data: queue2 } = await student2.rpc("join_matching_queue", {
      p_activity_id: activityId, p_template_id: templateId, p_eligible_roles: ["개발"],
      p_willing_leader: false, p_continue_on_fail: false,
    });

    await runWorker();
    const admin = createAdminClient();
    const { data: proposal } = await admin.from("match_proposals").select("id").eq("activity_id", activityId).single();

    const { error: declineError } = await student2.rpc("respond_to_match_proposal", { p_proposal_id: proposal!.id, p_accept: false });
    expect(declineError).toBeNull();

    const { data: finalProposal } = await admin.from("match_proposals").select("status").eq("id", proposal!.id).single();
    expect(finalProposal?.status).toBe("cancelled");

    const { data: q1 } = await admin.from("matching_queue").select("status").eq("id", queue1).single();
    const { data: q2 } = await admin.from("matching_queue").select("status").eq("id", queue2).single();
    expect(q1?.status).toBe("waiting"); // continue_on_fail=true → 재대기
    expect(q2?.status).toBe("cancelled"); // continue_on_fail=false(거절한 본인) → 종료
  });

  it("수락 기한이 지나면 만료 처리되고 계속 찾기 동의자만 재대기한다", async () => {
    activityId = await createMatchActivity(`만료 테스트 ${Date.now()}`);
    const templateId = await createTemplate(activityId, [
      { roleName: "기획", capacity: 1 },
      { roleName: "개발", capacity: 1 },
    ]);

    const student1 = await signInAs(TEST_USERS.student1.email);
    const student2 = await signInAs(TEST_USERS.student2.email);
    const { data: queue1 } = await student1.rpc("join_matching_queue", {
      p_activity_id: activityId, p_template_id: templateId, p_eligible_roles: ["기획"],
      p_willing_leader: true, p_continue_on_fail: true,
    });
    await student2.rpc("join_matching_queue", {
      p_activity_id: activityId, p_template_id: templateId, p_eligible_roles: ["개발"],
      p_willing_leader: false, p_continue_on_fail: false,
    });

    const now = new Date();
    await runWorker(now.toISOString());

    const admin = createAdminClient();
    const { data: proposal } = await admin.from("match_proposals").select("id, expires_at").eq("activity_id", activityId).single();

    const wayAfterExpiry = new Date(new Date(proposal!.expires_at as string).getTime() + 60_000).toISOString();
    const result = await runWorker(wayAfterExpiry);
    expect(result.expired_proposals).toBeGreaterThanOrEqual(1);

    const { data: finalProposal } = await admin.from("match_proposals").select("status").eq("id", proposal!.id).single();
    expect(finalProposal?.status).toBe("expired");

    const { data: q1 } = await admin.from("matching_queue").select("status").eq("id", queue1).single();
    expect(q1?.status).toBe("waiting");
  });

  it("매칭 대기 중 수동 파티에 합류하면 대기열 항목이 정리된다", async () => {
    activityId = await createMatchActivity(`수동 파티 합류 정리 테스트 ${Date.now()}`);
    const templateId = await createTemplate(activityId, [{ roleName: "기획", capacity: 1 }, { roleName: "개발", capacity: 1 }]);

    const student1 = await signInAs(TEST_USERS.student1.email);
    const leader = await signInAs(TEST_USERS.student3.email);

    const { data: queueId } = await student1.rpc("join_matching_queue", {
      p_activity_id: activityId, p_template_id: templateId, p_eligible_roles: ["기획"],
      p_willing_leader: true, p_continue_on_fail: true,
    });

    const { data: partyId, error: createError } = await leader.rpc("create_party", {
      p_activity_id: activityId,
      p_title: "수동 파티",
      p_description: null,
      p_meeting_mode: null,
      p_recruit_deadline: null,
      p_role_slots: [{ role_name: "팀원", capacity: 2 }],
      p_leader_role_name: "팀원",
    });
    expect(createError).toBeNull();

    const admin = createAdminClient();
    const { data: slot } = await admin.from("party_role_slots").select("id").eq("party_id", partyId).single();

    const { data: appId, error: applyError } = await student1.rpc("apply_to_party", {
      p_party_id: partyId, p_role_slot_id: slot!.id, p_message: null,
    });
    expect(applyError).toBeNull();

    const { error: approveError } = await leader.rpc("approve_application", { p_application_id: appId });
    expect(approveError).toBeNull();

    const { data: q1 } = await admin.from("matching_queue").select("status").eq("id", queueId).single();
    expect(q1?.status).toBe("cancelled");
  });
});
