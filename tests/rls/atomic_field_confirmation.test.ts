import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient, signInAs, TEST_USERS } from "./helpers";

// G3 보완 — docs/teachable-machine-integration.md 가이드 5.4 5번. 포스터를 저장하지 않아
// 등록/제보 화면에서 분석한 결과가 저장 시 사라지던 문제를 고친 세 함수를 검증한다:
// create_activity_with_fields(관리자 등록, 원자적 저장), submit_activity(제보자 "제안"으로
// 확장), approve_activity_submission(승인 시 관리자가 분야 "확정").

const IT_DATA = "c0000000-0000-0000-0000-000000000002";
const EDUCATION = "c0000000-0000-0000-0000-000000000003";
const DESIGN_MEDIA = "c0000000-0000-0000-0000-000000000005";

const admin = createAdminClient();

describe("create_activity_with_fields — 관리자 등록 원자적 저장", () => {
  let activityId: string | null = null;

  afterEach(async () => {
    if (activityId) {
      await admin.from("activities").delete().eq("id", activityId);
      activityId = null;
    }
  });

  it("활동 생성 + 분석 저장 + 분야 확정을 한 번에 처리하고, 모델 후보를 그대로 수락했는지 기록한다", async () => {
    const asAdmin = await signInAs(TEST_USERS.admin.email);
    const { data, error } = await asAdmin.rpc("create_activity_with_fields", {
      p_title: "원자적 저장 테스트",
      p_summary: null,
      p_description: null,
      p_org_name: null,
      p_source_url: null,
      p_location_type: "offline",
      p_region: null,
      p_activity_type_id: null,
      p_eligibility: null,
      p_participation_mode: "both",
      p_team_min_size: null,
      p_team_max_size: null,
      p_benefit: null,
      p_apply_start_at: null,
      p_apply_end_at: null,
      p_activity_start_at: null,
      p_activity_end_at: null,
      p_status: "draft",
      p_source_url_resolved: null,
      p_apply_end_at_evidence: null,
      p_weekly_hours: null,
      p_eligibility_scope: "unknown",
      p_eligible_major_ids: [],
      p_primary_interest_id: IT_DATA,
      p_secondary_interest_ids: [EDUCATION],
      p_accepted_candidate_interest_ids: [IT_DATA],
      p_poster_hash: "hash-atomic-1",
      p_model_version: "v1",
      p_preprocessing_version: "pad-square-v1",
      p_poster_scores: [{ classId: "IT_DATA", score: 0.9 }],
      p_poster_top_class: "IT_DATA",
      p_poster_top_score: 0.9,
      p_poster_margin: 0.8,
      p_poster_status: "suggested",
      p_poster_failure_reason: null,
    });
    expect(error).toBeNull();
    activityId = data as string;
    expect(activityId).toBeTruthy();

    const { data: analyses } = await admin.from("poster_analyses").select("id, activity_id, status").eq("activity_id", activityId);
    expect(analyses).toHaveLength(1);
    const analysisId = analyses![0].id as string;

    const { data: fields } = await admin
      .from("activity_fields")
      .select("interest_id, role, source, analysis_id, accepted_model_candidate")
      .eq("activity_id", activityId)
      .order("role");
    expect(fields).toHaveLength(2);
    const primaryField = fields!.find((f) => f.role === "primary")!;
    expect(primaryField.interest_id).toBe(IT_DATA);
    expect(primaryField.source).toBe("teachable_machine");
    expect(primaryField.analysis_id).toBe(analysisId);
    expect(primaryField.accepted_model_candidate).toBe(true);

    const secondaryField = fields!.find((f) => f.role === "secondary")!;
    expect(secondaryField.interest_id).toBe(EDUCATION);
    expect(secondaryField.source).toBe("manual");
    expect(secondaryField.analysis_id).toBeNull();
    expect(secondaryField.accepted_model_candidate).toBeNull();
  });

  it("분석 없이(포스터 없이) 등록해도 활동과 분야는 정상적으로 확정된다", async () => {
    const asAdmin = await signInAs(TEST_USERS.admin.email);
    const { data, error } = await asAdmin.rpc("create_activity_with_fields", {
      p_title: "분석 없는 등록 테스트",
      p_summary: null,
      p_description: null,
      p_org_name: null,
      p_source_url: null,
      p_location_type: "offline",
      p_region: null,
      p_activity_type_id: null,
      p_eligibility: null,
      p_participation_mode: "both",
      p_team_min_size: null,
      p_team_max_size: null,
      p_benefit: null,
      p_apply_start_at: null,
      p_apply_end_at: null,
      p_activity_start_at: null,
      p_activity_end_at: null,
      p_status: "draft",
      p_source_url_resolved: null,
      p_apply_end_at_evidence: null,
      p_weekly_hours: null,
      p_eligibility_scope: "unknown",
      p_eligible_major_ids: [],
      p_primary_interest_id: DESIGN_MEDIA,
      p_secondary_interest_ids: [],
      p_accepted_candidate_interest_ids: [],
      p_poster_hash: null,
      p_model_version: null,
      p_preprocessing_version: null,
      p_poster_scores: null,
      p_poster_top_class: null,
      p_poster_top_score: null,
      p_poster_margin: null,
      p_poster_status: null,
      p_poster_failure_reason: null,
    });
    expect(error).toBeNull();
    activityId = data as string;

    const { data: analyses } = await admin.from("poster_analyses").select("id").eq("activity_id", activityId);
    expect(analyses).toHaveLength(0);

    const { data: fields } = await admin.from("activity_fields").select("interest_id, role").eq("activity_id", activityId);
    expect(fields).toEqual([{ interest_id: DESIGN_MEDIA, role: "primary" }]);
  });

  it("일반 사용자는 호출할 수 없다", async () => {
    const asStudent1 = await signInAs(TEST_USERS.student1.email);
    const { error, data } = await asStudent1.rpc("create_activity_with_fields", {
      p_title: "일반 사용자 등록 시도",
      p_summary: null,
      p_description: null,
      p_org_name: null,
      p_source_url: null,
      p_location_type: "offline",
      p_region: null,
      p_activity_type_id: null,
      p_eligibility: null,
      p_participation_mode: "both",
      p_team_min_size: null,
      p_team_max_size: null,
      p_benefit: null,
      p_apply_start_at: null,
      p_apply_end_at: null,
      p_activity_start_at: null,
      p_activity_end_at: null,
      p_status: "draft",
      p_source_url_resolved: null,
      p_apply_end_at_evidence: null,
      p_weekly_hours: null,
      p_eligibility_scope: "unknown",
      p_eligible_major_ids: [],
    });
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("지정 전공 제한이면 전공을 선택해야 한다", async () => {
    const asAdmin = await signInAs(TEST_USERS.admin.email);
    const { error } = await asAdmin.rpc("create_activity_with_fields", {
      p_title: "자격 검증 테스트",
      p_summary: null,
      p_description: null,
      p_org_name: null,
      p_source_url: null,
      p_location_type: "offline",
      p_region: null,
      p_activity_type_id: null,
      p_eligibility: null,
      p_participation_mode: "both",
      p_team_min_size: null,
      p_team_max_size: null,
      p_benefit: null,
      p_apply_start_at: null,
      p_apply_end_at: null,
      p_activity_start_at: null,
      p_activity_end_at: null,
      p_status: "draft",
      p_source_url_resolved: null,
      p_apply_end_at_evidence: null,
      p_weekly_hours: null,
      p_eligibility_scope: "restricted",
      p_eligible_major_ids: [],
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("ELIGIBLE_MAJORS_REQUIRED");
  });
});

describe("submit_activity — 제보자는 분야를 제안만 한다", () => {
  let activityId: string | null = null;

  afterEach(async () => {
    if (activityId) {
      await admin.from("activities").delete().eq("id", activityId);
      activityId = null;
    }
  });

  it("제보 시 분석 결과와 제안 분야를 함께 저장하고, 확정(activity_fields)은 생기지 않는다", async () => {
    const asStudent1 = await signInAs(TEST_USERS.student1.email);
    const { data, error } = await asStudent1.rpc("submit_activity", {
      p_title: "제보 분야 제안 테스트",
      p_summary: null,
      p_description: null,
      p_org_name: null,
      p_source_url: null,
      p_location_type: "offline",
      p_region: null,
      p_participation_mode: "both",
      p_apply_start_at: null,
      p_apply_end_at: null,
      p_activity_start_at: null,
      p_activity_end_at: null,
      p_source_url_resolved: null,
      p_apply_end_at_evidence: null,
      p_primary_interest_id: IT_DATA,
      p_secondary_interest_ids: [EDUCATION],
      p_accepted_candidate_interest_ids: [IT_DATA],
      p_poster_hash: "hash-submission-1",
      p_model_version: "v1",
      p_preprocessing_version: "pad-square-v1",
      p_poster_scores: [{ classId: "IT_DATA", score: 0.9 }],
      p_poster_top_class: "IT_DATA",
      p_poster_top_score: 0.9,
      p_poster_margin: 0.8,
      p_poster_status: "suggested",
      p_poster_failure_reason: null,
    });
    expect(error).toBeNull();
    activityId = data as string;

    const { data: analyses } = await admin.from("poster_analyses").select("id").eq("activity_id", activityId);
    expect(analyses).toHaveLength(1);

    const { data: proposals } = await admin
      .from("activity_field_proposals")
      .select("interest_id, role, source, proposed_by")
      .eq("activity_id", activityId)
      .order("role");
    expect(proposals).toHaveLength(2);
    expect(proposals!.find((p) => p.role === "primary")).toMatchObject({
      interest_id: IT_DATA,
      source: "teachable_machine",
      proposed_by: TEST_USERS.student1.id,
    });

    const { data: confirmedFields } = await admin.from("activity_fields").select("id").eq("activity_id", activityId);
    expect(confirmedFields).toHaveLength(0);
  });

  it("제보자 본인은 자신의 제안을 조회할 수 있고, 다른 사용자는 조회할 수 없다", async () => {
    const asStudent1 = await signInAs(TEST_USERS.student1.email);
    const { data: submissionId } = await asStudent1.rpc("submit_activity", {
      p_title: "제안 조회 권한 테스트",
      p_summary: null,
      p_description: null,
      p_org_name: null,
      p_source_url: null,
      p_location_type: "offline",
      p_region: null,
      p_participation_mode: "both",
      p_primary_interest_id: IT_DATA,
    });
    activityId = submissionId as string;

    const { data: ownView } = await asStudent1.from("activity_field_proposals").select("id").eq("activity_id", activityId);
    expect(ownView?.length ?? 0).toBe(1);

    const asStudent2 = await signInAs(TEST_USERS.student2.email);
    const { data: otherView } = await asStudent2.from("activity_field_proposals").select("id").eq("activity_id", activityId);
    expect(otherView?.length ?? 0).toBe(0);

    const asAdmin = await signInAs(TEST_USERS.admin.email);
    const { data: adminView } = await asAdmin.from("activity_field_proposals").select("id").eq("activity_id", activityId);
    expect(adminView?.length ?? 0).toBe(1);
  });

  it("activity_field_proposals에 직접 insert할 수 없다 — 쓰기는 submit_activity 함수로만 한다", async () => {
    const asStudent1 = await signInAs(TEST_USERS.student1.email);
    activityId = (
      await admin.from("activities").insert({ title: "직접 삽입 방지 테스트", status: "draft", is_demo: true }).select("id").single()
    ).data!.id as string;

    const { error, data } = await asStudent1
      .from("activity_field_proposals")
      .insert({ activity_id: activityId, interest_id: IT_DATA, role: "primary", source: "manual", proposed_by: TEST_USERS.student1.id })
      .select();
    expect(error !== null || (data?.length ?? 0) === 0).toBe(true);
  });
});

describe("approve_activity_submission — 승인할 때 관리자가 분야를 확정한다", () => {
  let activityId: string | null = null;

  afterEach(async () => {
    if (activityId) {
      await admin.from("activities").delete().eq("id", activityId);
      activityId = null;
    }
  });

  async function createDraftWithAnalysis(): Promise<string> {
    const asStudent1 = await signInAs(TEST_USERS.student1.email);
    const { data } = await asStudent1.rpc("submit_activity", {
      p_title: `승인 테스트 ${Date.now()}`,
      p_summary: null,
      p_description: null,
      p_org_name: null,
      p_source_url: null,
      p_location_type: "offline",
      p_region: null,
      p_participation_mode: "both",
      p_primary_interest_id: EDUCATION, // 제보자의 제안 — 관리자가 승인 시 다르게 고를 수도 있다.
      p_poster_hash: "hash-approve-1",
      p_model_version: "v1",
      p_preprocessing_version: "pad-square-v1",
      p_poster_scores: [{ classId: "IT_DATA", score: 0.9 }],
      p_poster_top_class: "IT_DATA",
      p_poster_top_score: 0.9,
      p_poster_margin: 0.8,
      p_poster_status: "suggested",
      p_poster_failure_reason: null,
    });
    return data as string;
  }

  it("승인 시 관리자가 고른 분야가 확정되고, 분석 결과는 이미 연결된 activity_id 그대로 남는다", async () => {
    activityId = await createDraftWithAnalysis();
    const { data: analysisBefore } = await admin.from("poster_analyses").select("id, activity_id").eq("activity_id", activityId).single();

    const asAdmin = await signInAs(TEST_USERS.admin.email);
    const { error } = await asAdmin.rpc("approve_activity_submission", {
      p_activity_id: activityId,
      p_primary_interest_id: IT_DATA, // 제보자 제안(EDUCATION)과 다르게 확정 — 관리자가 바꿀 수 있다.
      p_secondary_interest_ids: [],
      p_accepted_candidate_interest_ids: [IT_DATA], // 모델 후보(IT_DATA)를 그대로 수락.
    });
    expect(error).toBeNull();

    const { data: activity } = await admin.from("activities").select("status").eq("id", activityId).single();
    expect(activity?.status).toBe("published");

    const { data: fields } = await admin
      .from("activity_fields")
      .select("interest_id, role, source, analysis_id, accepted_model_candidate")
      .eq("activity_id", activityId);
    expect(fields).toHaveLength(1);
    expect(fields![0].interest_id).toBe(IT_DATA);
    expect(fields![0].source).toBe("teachable_machine");
    expect(fields![0].analysis_id).toBe(analysisBefore!.id);
    expect(fields![0].accepted_model_candidate).toBe(true);

    // 분석 결과는 제보 시점부터 이미 이 activity_id에 연결돼 있었고, 승인 후에도 그대로다 —
    // 이 저장소는 제보도 activities의 같은 행을 쓰므로 "생성된 activity_id에 연결"이 자동이다.
    const { data: analysisAfter } = await admin.from("poster_analyses").select("activity_id").eq("id", analysisBefore!.id).single();
    expect(analysisAfter?.activity_id).toBe(activityId);
  });

  it("제보자(일반 사용자)가 승인 함수를 호출하면 거부된다", async () => {
    activityId = await createDraftWithAnalysis();
    const asStudent1 = await signInAs(TEST_USERS.student1.email);
    const { error } = await asStudent1.rpc("approve_activity_submission", {
      p_activity_id: activityId,
      p_primary_interest_id: IT_DATA,
      p_secondary_interest_ids: [],
      p_accepted_candidate_interest_ids: [],
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("NOT_ADMIN");

    const { data: fields } = await admin.from("activity_fields").select("id").eq("activity_id", activityId);
    expect(fields).toHaveLength(0);
  });
});
