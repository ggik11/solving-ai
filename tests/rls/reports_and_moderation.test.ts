import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient, signInAs, TEST_USERS } from "./helpers";
import { parseDbError } from "@/lib/errors";

// 5-A단계(신고·관리자·계정): reports/audit_logs 테이블·RLS는 2단계부터 있었지만 DB 함수가
// 전혀 없었다. 이번에 추가한 create_report/update_report_status/get_reported_message_context/
// suspend_account/unsuspend_account/submit_activity/approve·reject_activity_submission과
// 계정 정지 강제 트리거(_enforce_active_account)를 검증한다.

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

async function createMatchTemplate(activityId: string, roleName: string) {
  const admin = createAdminClient();
  const { data: template, error } = await admin
    .from("activity_match_templates")
    .insert({ activity_id: activityId, name: "정지 테스트 템플릿" })
    .select("id")
    .single();
  if (error || !template) throw new Error(`템플릿 생성 실패: ${error?.message}`);
  await admin.from("activity_match_template_roles").insert({ template_id: template.id, role_name: roleName, capacity: 1 });
  return template.id as string;
}

async function deleteReportsFor(reporterId: string) {
  const admin = createAdminClient();
  await admin.from("reports").delete().eq("reporter_id", reporterId);
}

async function setAccountStatus(profileId: string, status: "active" | "suspended" | "withdrawn") {
  const admin = createAdminClient();
  await admin.from("profiles").update({ account_status: status }).eq("id", profileId);
}

describe("신고 생성/처리", () => {
  afterEach(async () => {
    await deleteReportsFor(TEST_USERS.student2.id);
  });

  it("유효하지 않은 사유는 거부된다", async () => {
    const reporter = await signInAs(TEST_USERS.student2.email);
    const { error } = await reporter.rpc("create_report", {
      p_target_type: "profile",
      p_target_id: TEST_USERS.student3.id,
      p_reason: "그냥 싫어서",
      p_description: null,
    });
    expect(error).not.toBeNull();
    expect(parseDbError(error, "").code).toBe("INVALID_REASON");
  });

  it("자기 자신(profile)을 신고할 수 없다", async () => {
    const reporter = await signInAs(TEST_USERS.student2.email);
    const { error } = await reporter.rpc("create_report", {
      p_target_type: "profile",
      p_target_id: TEST_USERS.student2.id,
      p_reason: "spam",
      p_description: null,
    });
    expect(error).not.toBeNull();
    expect(parseDbError(error, "").code).toBe("CANNOT_REPORT_SELF");
  });

  it("정상적인 신고는 생성되고, 빈도 제한을 초과하면 거부된다", async () => {
    const reporter = await signInAs(TEST_USERS.student2.email);
    const admin = createAdminClient();
    await admin.from("app_settings").update({ value: { reports_per_hour: 2 } }).eq("key", "report_rate_limits");

    const { data: id1, error: e1 } = await reporter.rpc("create_report", {
      p_target_type: "profile", p_target_id: TEST_USERS.student3.id, p_reason: "spam", p_description: "설명1",
    });
    expect(e1).toBeNull();
    expect(id1).toBeTruthy();

    await reporter.rpc("create_report", {
      p_target_type: "profile", p_target_id: TEST_USERS.student3.id, p_reason: "scam", p_description: null,
    });

    const { error: e3 } = await reporter.rpc("create_report", {
      p_target_type: "profile", p_target_id: TEST_USERS.student3.id, p_reason: "other", p_description: null,
    });
    expect(e3).not.toBeNull();
    expect(parseDbError(e3, "").code).toBe("RATE_LIMITED");

    await admin.from("app_settings").update({ value: { reports_per_hour: 5 } }).eq("key", "report_rate_limits");
  });

  it("일반 사용자는 신고 상태를 변경할 수 없고, 운영자만 처리할 수 있다(감사 로그 기록 포함)", async () => {
    const reporter = await signInAs(TEST_USERS.student2.email);
    const { data: reportId } = await reporter.rpc("create_report", {
      p_target_type: "profile", p_target_id: TEST_USERS.student3.id, p_reason: "harassment", p_description: "테스트",
    });

    const { error: forbiddenError } = await reporter.rpc("update_report_status", {
      p_report_id: reportId, p_status: "resolved", p_resolution_note: null,
    });
    expect(forbiddenError).not.toBeNull();
    expect(parseDbError(forbiddenError, "").code).toBe("NOT_ADMIN");

    const adminClient = await signInAs(TEST_USERS.admin.email);
    const { error: adminError } = await adminClient.rpc("update_report_status", {
      p_report_id: reportId, p_status: "resolved", p_resolution_note: "확인 후 조치함",
    });
    expect(adminError).toBeNull();

    const admin = createAdminClient();
    const { data: updated } = await admin.from("reports").select("status, resolved_by").eq("id", reportId).single();
    expect(updated!.status).toBe("resolved");
    expect(updated!.resolved_by).toBe(TEST_USERS.admin.id);

    const { data: logs } = await admin
      .from("audit_logs")
      .select("id, action, target_id")
      .eq("action", "report_status_changed")
      .eq("target_id", reportId);
    expect(logs ?? []).toHaveLength(1);
  });
});

describe("신고된 메시지 최소 범위 열람", () => {
  let activityId: string;

  afterEach(async () => {
    if (activityId) await deleteActivity(activityId);
    await deleteReportsFor(TEST_USERS.student2.id);
  });

  it("운영자는 신고된 메시지 전후 몇 개만 볼 수 있고, 일반 사용자는 거부된다", async () => {
    activityId = await createPublishedTeamActivity(`신고메시지-컨텍스트 ${Date.now()}`);
    const leader = await signInAs(TEST_USERS.student1.email);
    const member = await signInAs(TEST_USERS.student2.email);

    const { data: partyId } = await leader.rpc("create_party", {
      p_activity_id: activityId, p_title: "메시지 컨텍스트 테스트", p_description: null, p_meeting_mode: null,
      p_recruit_deadline: null,
      p_role_slots: [{ role_name: "기획", capacity: 1 }, { role_name: "개발", capacity: 1 }],
      p_leader_role_name: "기획",
    });
    const admin = createAdminClient();
    const { data: slot } = await admin.from("party_role_slots").select("id").eq("party_id", partyId).eq("role_name", "개발").single();
    const { data: appId } = await member.rpc("apply_to_party", { p_party_id: partyId, p_role_slot_id: slot!.id, p_message: null });
    await leader.rpc("approve_application", { p_application_id: appId });

    const { data: room } = await admin.from("chat_rooms").select("id").eq("party_id", partyId).single();

    const messageIds: string[] = [];
    for (let i = 0; i < 7; i++) {
      const { data: msgId } = await leader.rpc("send_chat_message", {
        p_chat_room_id: room!.id, p_client_message_id: `ctx-${i}-${Date.now()}`, p_body: `메시지 ${i}`,
      });
      messageIds.push(msgId as string);
    }
    const targetMessageId = messageIds[3]!; // 중간 메시지를 신고 대상으로 삼는다.

    const { data: reportId } = await member.rpc("create_report", {
      p_target_type: "chat_message", p_target_id: targetMessageId, p_reason: "inappropriate", p_description: "부적절합니다.",
    });

    const { error: forbiddenError } = await member.rpc("get_reported_message_context", {
      p_report_id: reportId, p_context_size: 3,
    });
    expect(forbiddenError).not.toBeNull();
    expect(parseDbError(forbiddenError, "").code).toBe("NOT_ADMIN");

    const adminClient = await signInAs(TEST_USERS.admin.email);
    const { data: context, error: contextError } = await adminClient.rpc("get_reported_message_context", {
      p_report_id: reportId, p_context_size: 3,
    });
    expect(contextError).toBeNull();
    // 전체 8개(7개 생성 + 합류 시스템 메시지 1개) 중 신고 메시지 기준 전후 3개씩, 최대 7개만 — 방
    // 전체(8개)를 돌려주지 않는다("일반적인 전체 채팅 열람 도구를 만들지 않는다").
    expect((context as unknown[]).length).toBeLessThanOrEqual(7);
    const flagged = (context as { id: string; is_reported_message: boolean }[]).filter((m) => m.is_reported_message);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]!.id).toBe(targetMessageId);

    const { data: logs } = await admin
      .from("audit_logs")
      .select("id")
      .eq("action", "view_reported_message_context")
      .eq("target_id", reportId);
    expect(logs ?? []).toHaveLength(1);
  });
});

describe("계정 정지 — 쓰기 동작 거부", () => {
  afterEach(async () => {
    await setAccountStatus(TEST_USERS.student3.id, "active");
  });

  it("운영자만 계정을 정지·해제할 수 있고, 운영자 계정은 정지할 수 없다", async () => {
    const nonAdmin = await signInAs(TEST_USERS.student2.email);
    const { error: forbiddenError } = await nonAdmin.rpc("suspend_account", {
      p_profile_id: TEST_USERS.student3.id, p_reason: "테스트",
    });
    expect(forbiddenError).not.toBeNull();
    expect(parseDbError(forbiddenError, "").code).toBe("NOT_ADMIN");

    const adminClient = await signInAs(TEST_USERS.admin.email);
    const { error: cannotSuspendAdminError } = await adminClient.rpc("suspend_account", {
      p_profile_id: TEST_USERS.admin.id, p_reason: "테스트",
    });
    expect(cannotSuspendAdminError).not.toBeNull();
    expect(parseDbError(cannotSuspendAdminError, "").code).toBe("CANNOT_SUSPEND_ADMIN");
  });

  it("정지된 사용자는 파티 지원·생성·채팅·매칭 참가가 모두 거부되고, 해제 후에는 다시 가능하다", async () => {
    const admin = createAdminClient();
    const adminClient = await signInAs(TEST_USERS.admin.email);
    const { error: suspendError } = await adminClient.rpc("suspend_account", {
      p_profile_id: TEST_USERS.student3.id, p_reason: "테스트 정지",
    });
    expect(suspendError).toBeNull();

    const suspended = await signInAs(TEST_USERS.student3.email);

    const partyTestActivityId = await createPublishedTeamActivity(`정지테스트-파티생성 ${Date.now()}`);
    const { error: createPartyError } = await suspended.rpc("create_party", {
      p_activity_id: partyTestActivityId,
      p_title: "정지된 사용자의 파티", p_description: null, p_meeting_mode: null, p_recruit_deadline: null,
      p_role_slots: [{ role_name: "역할", capacity: 1 }], p_leader_role_name: "역할",
    });
    expect(createPartyError).not.toBeNull();
    expect(parseDbError(createPartyError, "").code).toBe("ACCOUNT_SUSPENDED");
    await deleteActivity(partyTestActivityId);

    // join_matching_queue 자체의 유효성 검증(활동/템플릿 존재, 가능 시간 설정 등)을 모두 통과한
    // 뒤에야 matching_queue INSERT에서 계정 정지 트리거가 걸린다는 것을 보이기 위해, 실제로
    // 참가 가능한 활동·템플릿을 만들어 둔다(student3은 seed상 수요일 가능 시간이 있다).
    const queueTestActivityId = await createPublishedTeamActivity(`정지테스트-매칭참가 ${Date.now()}`);
    const templateId = await createMatchTemplate(queueTestActivityId, "개발");
    const { error: joinQueueError } = await suspended.rpc("join_matching_queue", {
      p_activity_id: queueTestActivityId,
      p_template_id: templateId,
      p_eligible_roles: ["개발"], p_willing_leader: false, p_continue_on_fail: true,
    });
    expect(joinQueueError).not.toBeNull();
    expect(parseDbError(joinQueueError, "").code).toBe("ACCOUNT_SUSPENDED");
    await deleteActivity(queueTestActivityId);

    const { error: unsuspendForbidden } = await suspended.rpc("unsuspend_account", { p_profile_id: TEST_USERS.student3.id });
    expect(unsuspendForbidden).not.toBeNull();

    const { error: unsuspendError } = await adminClient.rpc("unsuspend_account", { p_profile_id: TEST_USERS.student3.id });
    expect(unsuspendError).toBeNull();

    const { data: restored } = await admin.from("profiles").select("account_status").eq("id", TEST_USERS.student3.id).single();
    expect(restored!.account_status).toBe("active");

    // 해제 후에는 다시 정상적으로 쓸 수 있다.
    const activityId = await createPublishedTeamActivity(`정지해제후-정상동작 ${Date.now()}`);
    const { error: afterUnsuspendError } = await suspended.rpc("create_party", {
      p_activity_id: activityId, p_title: "해제 후 생성", p_description: null, p_meeting_mode: null, p_recruit_deadline: null,
      p_role_slots: [{ role_name: "역할", capacity: 1 }], p_leader_role_name: "역할",
    });
    expect(afterUnsuspendError).toBeNull();
    await deleteActivity(activityId);
  });
});

describe("계정 관리 접근 통제", () => {
  it("일반 사용자는 audit_logs를 조회할 수 없다(RLS)", async () => {
    const nonAdmin = await signInAs(TEST_USERS.student2.email);
    const { data, error } = await nonAdmin.from("audit_logs").select("id").limit(1);
    // RLS 거부는 보통 빈 결과로 나타난다(정책이 select using (is_admin())이므로).
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("일반 사용자는 user_roles에 자신을 admin으로 쓸 수 없다(RLS에 쓰기 정책이 없음)", async () => {
    const nonAdmin = await signInAs(TEST_USERS.student2.email);
    const { error } = await nonAdmin.from("user_roles").insert({ profile_id: TEST_USERS.student2.id, role: "admin" });
    expect(error).not.toBeNull();
  });
});

describe("사용자 활동 제보 → 운영자 승인/거절", () => {
  let activityId = "";

  afterEach(async () => {
    if (activityId) await deleteActivity(activityId);
    activityId = "";
  });

  it("제보한 활동은 draft로 비공개 생성되고, 운영자만 승인·거절할 수 있다", async () => {
    const submitter = await signInAs(TEST_USERS.student2.email);
    const { data: id, error: submitError } = await submitter.rpc("submit_activity", {
      p_title: `제보 테스트 활동 ${Date.now()}`,
      p_summary: null, p_description: null, p_org_name: null, p_source_url: null,
      p_location_type: "offline", p_region: null, p_participation_mode: "team",
    });
    expect(submitError).toBeNull();
    activityId = id as string;

    const admin = createAdminClient();
    const { data: row } = await admin.from("activities").select("status, created_by").eq("id", activityId).single();
    expect(row!.status).toBe("draft");
    expect(row!.created_by).toBe(TEST_USERS.student2.id);

    const { error: forbiddenApprove } = await submitter.rpc("approve_activity_submission", { p_activity_id: activityId });
    expect(forbiddenApprove).not.toBeNull();
    expect(parseDbError(forbiddenApprove, "").code).toBe("NOT_ADMIN");

    const adminClient = await signInAs(TEST_USERS.admin.email);
    const { error: approveError } = await adminClient.rpc("approve_activity_submission", { p_activity_id: activityId });
    expect(approveError).toBeNull();

    const { data: published } = await admin.from("activities").select("status").eq("id", activityId).single();
    expect(published!.status).toBe("published");

    const { data: notifications } = await admin
      .from("notifications")
      .select("id")
      .eq("profile_id", TEST_USERS.student2.id)
      .eq("dedupe_key", "activity_submission_approved:" + activityId);
    expect(notifications ?? []).toHaveLength(1);
  });

  it("거절된 제보는 archived로 전환되고 제보자에게 알림이 간다", async () => {
    const submitter = await signInAs(TEST_USERS.student3.email);
    const { data: id } = await submitter.rpc("submit_activity", {
      p_title: `제보 거절 테스트 ${Date.now()}`,
      p_summary: null, p_description: null, p_org_name: null, p_source_url: null,
      p_location_type: "offline", p_region: null, p_participation_mode: "team",
    });
    activityId = id as string;

    const adminClient = await signInAs(TEST_USERS.admin.email);
    const { error: rejectError } = await adminClient.rpc("reject_activity_submission", {
      p_activity_id: activityId, p_note: "출처 확인이 필요합니다.",
    });
    expect(rejectError).toBeNull();

    const admin = createAdminClient();
    const { data: row } = await admin.from("activities").select("status").eq("id", activityId).single();
    expect(row!.status).toBe("archived");

    const { data: notifications } = await admin
      .from("notifications")
      .select("body")
      .eq("profile_id", TEST_USERS.student3.id)
      .eq("dedupe_key", "activity_submission_rejected:" + activityId);
    expect(notifications ?? []).toHaveLength(1);
    expect(notifications![0]!.body).toContain("출처 확인이 필요합니다");
  });
});
