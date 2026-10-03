import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient, signInAs, TEST_USERS } from "./helpers";

// 5단계: 실제 매칭 워커(plpgsql _find_match_for_group)를 대상으로 한 추가 시나리오 검증.
// tests/rls/matching.test.ts가 이미 다루는 "매칭 성공/동시 수락/워커 중복 실행/거절/만료/수동 파티
// 교차 정리"에 없는 5가지를 보강한다: 겹침의 함정, 차단 관계 상호 제외, 팀장 동의자 없음,
// 역할 부족(헤드카운트는 충분하지만 특정 역할을 채울 사람이 없음), 대기 시간 우선·동점 규칙.
//
// seed.sql 기준 기존 가능 시간: student1(월 9-12, 수 19-21), student2(화 13-18, 월 10-12),
// student3(수 18-22). 겹침의 함정 시나리오는 목(Thu)/금(Fri)/토(Sat) 10-12에 임시 슬롯을 추가해
// "모든 쌍은 겹치지만 셋이 동시에 겹치는 요일은 없음"을 만든 뒤 테스트 후 정리한다.

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
    .insert({ activity_id: activityId, name: "시나리오 템플릿" })
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

async function addAvailability(profileId: string, slots: { day: number; start: string; end: string }[]) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("availability_slots")
    .insert(slots.map((s) => ({ profile_id: profileId, day_of_week: s.day, start_time: s.start, end_time: s.end })))
    .select("id");
  if (error || !data) throw new Error(`가능 시간 추가 실패: ${error?.message}`);
  return data.map((r) => r.id as string);
}

async function deleteAvailabilityByIds(ids: string[]) {
  if (ids.length === 0) return;
  const admin = createAdminClient();
  await admin.from("availability_slots").delete().in("id", ids);
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

describe("빠른 매칭 — DB 워커 추가 시나리오", () => {
  let activityId: string;
  let availabilityIds: string[] = [];

  afterEach(async () => {
    if (activityId) await deleteActivity(activityId);
    activityId = "";
    await deleteAvailabilityByIds(availabilityIds);
    availabilityIds = [];
    await removeBlock(TEST_USERS.student1.id, TEST_USERS.student3.id);
  });

  it("겹침의 함정: 모든 쌍은 겹치지만 셋이 동시에 겹치는 시간이 없으면 팀이 생성되지 않는다", async () => {
    // A(student1)-B(student2)는 목 10-12에만, B-C(student3)는 금 10-12에만, A-C는 토 10-12에만 겹치게
    // 임시 슬롯을 추가한다 — 기존 seed 슬롯(월/화/수)과는 요일이 겹치지 않아 기존 테스트에 영향 없음.
    const a = await addAvailability(TEST_USERS.student1.id, [
      { day: 4, start: "10:00", end: "12:00" },
      { day: 6, start: "10:00", end: "12:00" },
    ]);
    const b = await addAvailability(TEST_USERS.student2.id, [
      { day: 4, start: "10:00", end: "12:00" },
      { day: 5, start: "10:00", end: "12:00" },
    ]);
    const c = await addAvailability(TEST_USERS.student3.id, [
      { day: 5, start: "10:00", end: "12:00" },
      { day: 6, start: "10:00", end: "12:00" },
    ]);
    availabilityIds = [...a, ...b, ...c];

    activityId = await createMatchActivity(`겹침의 함정 ${Date.now()}`);
    const templateId = await createTemplate(activityId, [
      { roleName: "역할A", capacity: 1 },
      { roleName: "역할B", capacity: 1 },
      { roleName: "역할C", capacity: 1 },
    ]);

    const student1 = await signInAs(TEST_USERS.student1.email);
    const student2 = await signInAs(TEST_USERS.student2.email);
    const student3 = await signInAs(TEST_USERS.student3.email);

    await student1.rpc("join_matching_queue", {
      p_activity_id: activityId, p_template_id: templateId, p_eligible_roles: ["역할A"],
      p_willing_leader: true, p_continue_on_fail: true,
    });
    await student2.rpc("join_matching_queue", {
      p_activity_id: activityId, p_template_id: templateId, p_eligible_roles: ["역할B"],
      p_willing_leader: true, p_continue_on_fail: true,
    });
    await student3.rpc("join_matching_queue", {
      p_activity_id: activityId, p_template_id: templateId, p_eligible_roles: ["역할C"],
      p_willing_leader: true, p_continue_on_fail: true,
    });

    // run_match_worker는 대기 중인 모든 (활동,템플릿) 그룹을 한 번에 처리하므로, 동시에 실행되는
    // 다른 테스트 파일의 그룹도 함께 집계된 전역 카운트(new_proposals)를 이 활동 하나에 대한
    // 기대값과 직접 비교할 수 없다 — 항상 activity_id로 좁혀서 검증한다.
    await runWorker();

    const admin = createAdminClient();
    const { data: proposals } = await admin.from("match_proposals").select("id").eq("activity_id", activityId);
    expect(proposals ?? []).toHaveLength(0);
  });

  it("차단 관계: 서로 차단한 사용자는 같은 팀으로 묶이지 않고 대안이 선택된다", async () => {
    activityId = await createMatchActivity(`차단 관계 ${Date.now()}`);
    const templateId = await createTemplate(activityId, [
      { roleName: "기획", capacity: 1 },
      { roleName: "개발", capacity: 1 },
    ]);

    // 이 테스트만을 위해 임시로 student1↔student3 차단 관계를 만들고 afterEach에서 정리한다
    // (예전에는 seed.sql의 고정 데모 차단을 재사용했지만, apply_to_party가 차단을 검사하게 된
    // 뒤로는 그 고정 관계가 이 테스트와 무관한 다른 파티 지원 테스트에까지 영향을 줬다).
    await addBlock(TEST_USERS.student1.id, TEST_USERS.student3.id);
    const student1 = await signInAs(TEST_USERS.student1.email); // 기획, 리더 — 월/수 가능
    const student3 = await signInAs(TEST_USERS.student3.email); // 개발 후보 1 (seed상 student1과 차단) — 수 가능
    const student2 = await signInAs(TEST_USERS.student2.email); // 개발 후보 2(대안) — 월 가능(student1과 겹침)

    const admin = createAdminClient();

    // student3이 먼저 참가(원래는 대기 시간 우선으로 student3이 선택되어야 하지만 차단으로 제외되어야 함)
    await student3.rpc("join_matching_queue", {
      p_activity_id: activityId, p_template_id: templateId, p_eligible_roles: ["개발"],
      p_willing_leader: false, p_continue_on_fail: true,
    });
    await student2.rpc("join_matching_queue", {
      p_activity_id: activityId, p_template_id: templateId, p_eligible_roles: ["개발"],
      p_willing_leader: false, p_continue_on_fail: true,
    });
    await student1.rpc("join_matching_queue", {
      p_activity_id: activityId, p_template_id: templateId, p_eligible_roles: ["기획"],
      p_willing_leader: true, p_continue_on_fail: true,
    });

    await runWorker();

    const { data: proposals } = await admin.from("match_proposals").select("id").eq("activity_id", activityId);
    expect(proposals ?? []).toHaveLength(1);
    const proposal = proposals![0]!;
    const { data: members } = await admin
      .from("match_proposal_members")
      .select("profile_id")
      .eq("proposal_id", proposal.id);
    const memberIds = (members ?? []).map((m) => m.profile_id as string);
    expect(memberIds).toContain(TEST_USERS.student1.id);
    expect(memberIds).toContain(TEST_USERS.student2.id);
    expect(memberIds).not.toContain(TEST_USERS.student3.id);
  });

  it("팀장 동의자 없음: 역할·시간이 맞아도 아무도 팀장에 동의하지 않으면 제안이 생기지 않는다", async () => {
    activityId = await createMatchActivity(`팀장 동의 없음 ${Date.now()}`);
    const templateId = await createTemplate(activityId, [
      { roleName: "기획", capacity: 1 },
      { roleName: "개발", capacity: 1 },
    ]);

    const student1 = await signInAs(TEST_USERS.student1.email);
    const student2 = await signInAs(TEST_USERS.student2.email);

    const { data: q1 } = await student1.rpc("join_matching_queue", {
      p_activity_id: activityId, p_template_id: templateId, p_eligible_roles: ["기획"],
      p_willing_leader: false, p_continue_on_fail: true,
    });
    const { data: q2 } = await student2.rpc("join_matching_queue", {
      p_activity_id: activityId, p_template_id: templateId, p_eligible_roles: ["개발"],
      p_willing_leader: false, p_continue_on_fail: true,
    });

    await runWorker();

    const admin = createAdminClient();
    const { data: proposals } = await admin.from("match_proposals").select("id").eq("activity_id", activityId);
    expect(proposals ?? []).toHaveLength(0);
    const { data: rows } = await admin.from("matching_queue").select("id, status").in("id", [q1, q2]);
    expect(rows!.every((r) => r.status === "waiting")).toBe(true);
  });

  it("역할 부족: 인원은 충분해도 특정 역할을 채울 후보가 없으면 제안이 생기지 않는다", async () => {
    activityId = await createMatchActivity(`역할 부족 ${Date.now()}`);
    const templateId = await createTemplate(activityId, [
      { roleName: "기획", capacity: 1 },
      { roleName: "개발", capacity: 1 },
    ]);

    const student1 = await signInAs(TEST_USERS.student1.email);
    const student2 = await signInAs(TEST_USERS.student2.email);

    // 둘 다 "개발"만 가능 — 2명이 모여도 "기획"을 채울 사람이 없다.
    await student1.rpc("join_matching_queue", {
      p_activity_id: activityId, p_template_id: templateId, p_eligible_roles: ["개발"],
      p_willing_leader: true, p_continue_on_fail: true,
    });
    await student2.rpc("join_matching_queue", {
      p_activity_id: activityId, p_template_id: templateId, p_eligible_roles: ["개발"],
      p_willing_leader: true, p_continue_on_fail: true,
    });

    await runWorker();

    const admin = createAdminClient();
    const { data: proposals } = await admin.from("match_proposals").select("id").eq("activity_id", activityId);
    expect(proposals ?? []).toHaveLength(0);
  });

  it("대기 시간 우선: 같은 역할에 여러 후보가 있으면 먼저 대기열에 참가한 사람이 선택된다", async () => {
    activityId = await createMatchActivity(`대기 시간 우선 ${Date.now()}`);
    const templateId = await createTemplate(activityId, [{ roleName: "개발", capacity: 1 }]);

    const student4 = await signInAs(TEST_USERS.student4.email);
    const student3 = await signInAs(TEST_USERS.student3.email);
    const student2 = await signInAs(TEST_USERS.student2.email);

    const { data: qFirst } = await student4.rpc("join_matching_queue", {
      p_activity_id: activityId, p_template_id: templateId, p_eligible_roles: ["개발"],
      p_willing_leader: true, p_continue_on_fail: true,
    });
    const admin = createAdminClient();
    // 참가 순서를 결정적으로 만들기 위해 created_at을 명시적으로 벌려둔다(네트워크 타이밍 의존 제거).
    await admin.from("matching_queue").update({ created_at: new Date(Date.now() - 2000).toISOString() }).eq("id", qFirst);

    const { data: qSecond } = await student3.rpc("join_matching_queue", {
      p_activity_id: activityId, p_template_id: templateId, p_eligible_roles: ["개발"],
      p_willing_leader: true, p_continue_on_fail: true,
    });
    await admin.from("matching_queue").update({ created_at: new Date(Date.now() - 1000).toISOString() }).eq("id", qSecond);

    await student2.rpc("join_matching_queue", {
      p_activity_id: activityId, p_template_id: templateId, p_eligible_roles: ["개발"],
      p_willing_leader: true, p_continue_on_fail: true,
    });

    await runWorker();

    const { data: proposals } = await admin.from("match_proposals").select("id").eq("activity_id", activityId);
    expect(proposals ?? []).toHaveLength(1);
    const { data: members } = await admin.from("match_proposal_members").select("queue_id").eq("proposal_id", proposals![0]!.id);
    expect(members).toHaveLength(1);
    expect(members![0]!.queue_id).toBe(qFirst); // 가장 먼저(가장 오래 기다린) 참가한 student4가 선택됨
  });

  it("동점 규칙: 대기 시작 시각이 완전히 같으면 queue id 순으로 결정적으로 고른다", async () => {
    activityId = await createMatchActivity(`동점 규칙 ${Date.now()}`);
    const templateId = await createTemplate(activityId, [{ roleName: "개발", capacity: 1 }]);

    const student2 = await signInAs(TEST_USERS.student2.email);
    const student3 = await signInAs(TEST_USERS.student3.email);

    const { data: qA } = await student2.rpc("join_matching_queue", {
      p_activity_id: activityId, p_template_id: templateId, p_eligible_roles: ["개발"],
      p_willing_leader: true, p_continue_on_fail: true,
    });
    const { data: qB } = await student3.rpc("join_matching_queue", {
      p_activity_id: activityId, p_template_id: templateId, p_eligible_roles: ["개발"],
      p_willing_leader: true, p_continue_on_fail: true,
    });

    const admin = createAdminClient();
    const sameInstant = new Date().toISOString();
    await admin.from("matching_queue").update({ created_at: sameInstant }).in("id", [qA, qB]);

    await runWorker();

    const expectedWinner = [qA as string, qB as string].sort()[0];
    const { data: proposals } = await admin.from("match_proposals").select("id").eq("activity_id", activityId);
    expect(proposals ?? []).toHaveLength(1);
    const { data: members } = await admin.from("match_proposal_members").select("queue_id").eq("proposal_id", proposals![0]!.id);
    expect(members![0]!.queue_id).toBe(expectedWinner);
  });
});
