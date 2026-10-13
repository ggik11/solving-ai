import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient, createAnonClient, signInAs, TEST_USERS } from "./helpers";

// G3(티처블 머신 연동 골격) — poster_analyses/model_class_field_map과 그 기록·조회 함수.
// docs/teachable-machine-integration.md 3.5/3.6, 9장 G3. 모델이 아직 없어 실제 추론은 하지
// 않는다 — 여기서는 "저장된 숫자/상태를 누가 쓰고 읽을 수 있는지"만 검증한다.

const IT_DATA = "c0000000-0000-0000-0000-000000000002"; // interests.code='IT_DATA'

async function createTestActivity(admin: ReturnType<typeof createAdminClient>, overrides: Record<string, unknown> = {}) {
  const { data, error } = await admin
    .from("activities")
    .insert({ title: `G3 테스트용 활동 ${Date.now()}`, status: "published", is_demo: true, ...overrides })
    .select("id")
    .single();
  if (error || !data) throw new Error(`테스트 활동 생성 실패: ${error?.message}`);
  return data.id as string;
}

describe("record_poster_analysis / find_cached_poster_analysis", () => {
  const admin = createAdminClient();
  let activityId: string | null = null;

  afterEach(async () => {
    if (activityId) {
      await admin.from("activities").delete().eq("id", activityId);
      activityId = null;
    }
  });

  it("활동 소유자는 분석 결과를 기록할 수 있고, 그대로 조회할 수 있다", async () => {
    const asStudent1 = await signInAs(TEST_USERS.student1.email);
    activityId = await createTestActivity(admin, { created_by: TEST_USERS.student1.id });

    const { data: analysisId, error } = await asStudent1.rpc("record_poster_analysis", {
      p_activity_id: activityId,
      p_poster_hash: "hash-owner",
      p_model_version: "v1",
      p_preprocessing_version: "pad-square-v1",
      p_scores: [{ classId: "IT_DATA", score: 0.9 }],
      p_top_class: "IT_DATA",
      p_top_score: 0.9,
      p_margin: 0.8,
      p_status: "suggested",
      p_failure_reason: null,
    });
    expect(error).toBeNull();
    expect(analysisId).toBeTruthy();

    const { data: row } = await asStudent1.from("poster_analyses").select("status, top_class").eq("id", analysisId as string).single();
    expect(row?.status).toBe("suggested");
    expect(row?.top_class).toBe("IT_DATA");
  });

  it("관리자는 다른 사용자가 만든 활동에도 분석 결과를 기록할 수 있다", async () => {
    activityId = await createTestActivity(admin, { created_by: TEST_USERS.student1.id });
    const asAdmin = await signInAs(TEST_USERS.admin.email);

    const { error } = await asAdmin.rpc("record_poster_analysis", {
      p_activity_id: activityId,
      p_poster_hash: "hash-admin",
      p_model_version: "v1",
      p_preprocessing_version: "pad-square-v1",
      p_scores: [{ classId: "IT_DATA", score: 0.9 }],
      p_top_class: "IT_DATA",
      p_top_score: 0.9,
      p_margin: 0.8,
      p_status: "suggested",
      p_failure_reason: null,
    });
    expect(error).toBeNull();
  });

  it("남의 활동에는 분석 결과를 기록할 수 없다", async () => {
    activityId = await createTestActivity(admin, { created_by: TEST_USERS.student1.id });
    const asStudent2 = await signInAs(TEST_USERS.student2.email);

    const { error } = await asStudent2.rpc("record_poster_analysis", {
      p_activity_id: activityId,
      p_poster_hash: "hash-other",
      p_model_version: "v1",
      p_preprocessing_version: "pad-square-v1",
      p_scores: [{ classId: "IT_DATA", score: 0.9 }],
      p_top_class: "IT_DATA",
      p_top_score: 0.9,
      p_margin: 0.8,
      p_status: "suggested",
      p_failure_reason: null,
    });
    expect(error).not.toBeNull();
  });

  it("실패 상태는 실패 사유가 있어야 하고, 실패가 아니면 사유를 남길 수 없다(가이드 3.5 체크리스트 7번)", async () => {
    const asStudent1 = await signInAs(TEST_USERS.student1.email);
    activityId = await createTestActivity(admin, { created_by: TEST_USERS.student1.id });

    const { error: missingReason } = await asStudent1.rpc("record_poster_analysis", {
      p_activity_id: activityId,
      p_poster_hash: "hash-fail-1",
      p_model_version: "v1",
      p_preprocessing_version: "pad-square-v1",
      p_scores: [],
      p_top_class: null,
      p_top_score: null,
      p_margin: null,
      p_status: "failed",
      p_failure_reason: null,
    });
    expect(missingReason).not.toBeNull();

    const { error: unexpectedReason } = await asStudent1.rpc("record_poster_analysis", {
      p_activity_id: activityId,
      p_poster_hash: "hash-fail-2",
      p_model_version: "v1",
      p_preprocessing_version: "pad-square-v1",
      p_scores: [{ classId: "IT_DATA", score: 0.9 }],
      p_top_class: "IT_DATA",
      p_top_score: 0.9,
      p_margin: 0.8,
      p_status: "suggested",
      p_failure_reason: "model_missing",
    });
    expect(unexpectedReason).not.toBeNull();

    const { error: ok } = await asStudent1.rpc("record_poster_analysis", {
      p_activity_id: activityId,
      p_poster_hash: "hash-fail-3",
      p_model_version: "unknown",
      p_preprocessing_version: "pad-square-v1",
      p_scores: [],
      p_top_class: null,
      p_top_score: null,
      p_margin: null,
      p_status: "failed",
      p_failure_reason: "model_missing",
    });
    expect(ok).toBeNull();
  });

  it("활동이 아직 없어도(activity_id=null) 분석을 남길 수 있고, 본인 분석만 재사용된다", async () => {
    const asStudent1 = await signInAs(TEST_USERS.student1.email);
    const asStudent2 = await signInAs(TEST_USERS.student2.email);

    const { data: analysisId, error } = await asStudent1.rpc("record_poster_analysis", {
      p_activity_id: null,
      p_poster_hash: "hash-pre-register",
      p_model_version: "v1",
      p_preprocessing_version: "pad-square-v1",
      p_scores: [{ classId: "IT_DATA", score: 0.9 }],
      p_top_class: "IT_DATA",
      p_top_score: 0.9,
      p_margin: 0.8,
      p_status: "suggested",
      p_failure_reason: null,
    });
    expect(error).toBeNull();

    const { data: ownHit } = await asStudent1
      .rpc("find_cached_poster_analysis", {
        p_activity_id: null,
        p_poster_hash: "hash-pre-register",
        p_model_version: "v1",
        p_preprocessing_version: "pad-square-v1",
      })
      .maybeSingle();
    expect(ownHit).not.toBeNull();

    const { data: otherMiss } = await asStudent2
      .rpc("find_cached_poster_analysis", {
        p_activity_id: null,
        p_poster_hash: "hash-pre-register",
        p_model_version: "v1",
        p_preprocessing_version: "pad-square-v1",
      })
      .maybeSingle();
    expect(otherMiss).toBeNull();

    await admin.from("poster_analyses").delete().eq("id", analysisId as string);
  });

  it("다른 활동의 같은 해시는 재사용하지 않는다 — 활동 단위로 캐시가 스코프된다", async () => {
    const asStudent1 = await signInAs(TEST_USERS.student1.email);
    activityId = await createTestActivity(admin, { created_by: TEST_USERS.student1.id });
    const otherActivityId = await createTestActivity(admin, { created_by: TEST_USERS.student1.id });

    try {
      await asStudent1.rpc("record_poster_analysis", {
        p_activity_id: activityId,
        p_poster_hash: "hash-scoped",
        p_model_version: "v1",
        p_preprocessing_version: "pad-square-v1",
        p_scores: [{ classId: "IT_DATA", score: 0.9 }],
        p_top_class: "IT_DATA",
        p_top_score: 0.9,
        p_margin: 0.8,
        p_status: "suggested",
        p_failure_reason: null,
      });

      const { data: miss } = await asStudent1
        .rpc("find_cached_poster_analysis", {
          p_activity_id: otherActivityId,
          p_poster_hash: "hash-scoped",
          p_model_version: "v1",
          p_preprocessing_version: "pad-square-v1",
        })
        .maybeSingle();
      expect(miss).toBeNull();
    } finally {
      await admin.from("activities").delete().eq("id", otherActivityId);
    }
  });

  it("poster_analyses 테이블에 직접 insert할 수 없다 — 쓰기는 함수로만 한다", async () => {
    const asStudent1 = await signInAs(TEST_USERS.student1.email);
    activityId = await createTestActivity(admin, { created_by: TEST_USERS.student1.id });

    const { error, data } = await asStudent1
      .from("poster_analyses")
      .insert({
        activity_id: activityId,
        poster_hash: "direct-insert",
        model_version: "v1",
        preprocessing_version: "pad-square-v1",
        scores: [],
        status: "suggested",
        analyzed_by: TEST_USERS.student1.id,
      })
      .select();
    expect(error !== null || (data?.length ?? 0) === 0).toBe(true);
  });

  it("관계없는 사용자는 다른 사람의 분석 결과를 조회할 수 없다", async () => {
    const asStudent1 = await signInAs(TEST_USERS.student1.email);
    activityId = await createTestActivity(admin, { created_by: TEST_USERS.student1.id });
    const { data: analysisId } = await asStudent1.rpc("record_poster_analysis", {
      p_activity_id: activityId,
      p_poster_hash: "hash-private",
      p_model_version: "v1",
      p_preprocessing_version: "pad-square-v1",
      p_scores: [{ classId: "IT_DATA", score: 0.9 }],
      p_top_class: "IT_DATA",
      p_top_score: 0.9,
      p_margin: 0.8,
      p_status: "suggested",
      p_failure_reason: null,
    });

    const asStudent2 = await signInAs(TEST_USERS.student2.email);
    const { data } = await asStudent2.from("poster_analyses").select("id").eq("id", analysisId as string);
    expect(data?.length ?? 0).toBe(0);
  });
});

describe("activity_fields.analysis_id — 재분석이 확정값을 바꾸지 않는다(가이드 체크리스트 8번)", () => {
  const admin = createAdminClient();
  let activityId: string | null = null;

  afterEach(async () => {
    if (activityId) {
      await admin.from("activities").delete().eq("id", activityId);
      activityId = null;
    }
  });

  it("연결된 분석이 지워져도 확정된 activity_fields 행은 남고 analysis_id만 비워진다", async () => {
    activityId = await createTestActivity(admin);
    const { data: analysis } = await admin
      .from("poster_analyses")
      .insert({
        activity_id: activityId,
        poster_hash: "hash-link",
        model_version: "v1",
        preprocessing_version: "pad-square-v1",
        scores: [{ classId: "IT_DATA", score: 0.9 }],
        top_class: "IT_DATA",
        status: "suggested",
        analyzed_by: TEST_USERS.admin.id,
      })
      .select("id")
      .single();

    await admin.from("activity_fields").insert({
      activity_id: activityId,
      interest_id: IT_DATA,
      role: "primary",
      source: "teachable_machine",
      analysis_id: analysis!.id,
      confirmed_by: TEST_USERS.admin.id,
    });

    await admin.from("poster_analyses").delete().eq("id", analysis!.id);

    const { data: field } = await admin
      .from("activity_fields")
      .select("interest_id, role, analysis_id")
      .eq("activity_id", activityId)
      .single();
    expect(field?.interest_id).toBe(IT_DATA);
    expect(field?.analysis_id).toBeNull();
  });
});

describe("model_class_field_map — 공개 읽기, 운영자만 쓰기(가이드 3.6)", () => {
  it("비로그인 사용자도 조회할 수 있다", async () => {
    const admin = createAdminClient();
    await admin.from("model_class_field_map").insert({ model_version: "test-v1", class_id: "IT_DATA", interest_id: IT_DATA });
    try {
      const anon = createAnonClient();
      const { data, error } = await anon.from("model_class_field_map").select("class_id").eq("model_version", "test-v1");
      expect(error).toBeNull();
      expect(data?.length ?? 0).toBe(1);
    } finally {
      await admin.from("model_class_field_map").delete().eq("model_version", "test-v1");
    }
  });

  it("일반 사용자는 연결표를 쓸 수 없다", async () => {
    const asStudent1 = await signInAs(TEST_USERS.student1.email);
    const { error, data } = await asStudent1
      .from("model_class_field_map")
      .insert({ model_version: "test-v2", class_id: "IT_DATA", interest_id: IT_DATA })
      .select();
    expect(error !== null || (data?.length ?? 0) === 0).toBe(true);
  });

  it("운영자는 연결표를 쓸 수 있다", async () => {
    const asAdmin = await signInAs(TEST_USERS.admin.email);
    const { error } = await asAdmin.from("model_class_field_map").insert({ model_version: "test-v3", class_id: "IT_DATA", interest_id: IT_DATA });
    expect(error).toBeNull();
    const admin = createAdminClient();
    await admin.from("model_class_field_map").delete().eq("model_version", "test-v3");
  });
});

describe("app_settings — poster_classifier(가이드 3.7)", () => {
  it("설정값이 존재하고 임계값이 0~1 사이다", async () => {
    const admin = createAdminClient();
    const { data } = await admin.from("app_settings").select("value").eq("key", "poster_classifier").single();
    const value = data!.value as { enabled: boolean; suggest_min_top_score: number; suggest_min_margin: number; model_path: string };
    expect(typeof value.enabled).toBe("boolean");
    expect(value.suggest_min_top_score).toBeGreaterThan(0);
    expect(value.suggest_min_top_score).toBeLessThanOrEqual(1);
    expect(value.suggest_min_margin).toBeGreaterThan(0);
    expect(value.model_path).toContain("/");
  });

  it("일반 사용자는 poster_classifier 설정을 수정할 수 없다", async () => {
    const asStudent1 = await signInAs(TEST_USERS.student1.email);
    const { error, data } = await asStudent1
      .from("app_settings")
      .update({ value: { enabled: false } })
      .eq("key", "poster_classifier")
      .select();
    expect(error !== null || (data?.length ?? 0) === 0).toBe(true);
  });
});
