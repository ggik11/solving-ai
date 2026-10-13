import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient, signInAs, TEST_USERS } from "./helpers";

// G2(추천 개편과 자격 분리) — activity_fields(관리자 수동 확정)와 activities.eligibility_*
// (전공 관련성과 분리된 지원 자격) 검증. docs/teachable-machine-integration.md 3.2/3.4, 9장 G2.

const IT_DATA = "c0000000-0000-0000-0000-000000000002"; // interests.code='IT_DATA' (G1 고정 UUID)
const EDUCATION = "c0000000-0000-0000-0000-000000000003"; // interests.code='EDUCATION'
const CS_MAJOR = "e0000000-0000-0000-0000-000000000021"; // majors.code='COMPUTER_SCIENCE'

async function createTestActivity(admin: ReturnType<typeof createAdminClient>, overrides: Record<string, unknown> = {}) {
  const { data, error } = await admin
    .from("activities")
    .insert({ title: `G2 테스트용 활동 ${Date.now()}`, status: "published", is_demo: true, ...overrides })
    .select("id")
    .single();
  if (error || !data) throw new Error(`테스트 활동 생성 실패: ${error?.message}`);
  return data.id as string;
}

describe("activity_fields — 관리자 수동 확정", () => {
  const admin = createAdminClient();
  let activityId: string | null = null;

  afterEach(async () => {
    if (activityId) {
      await admin.from("activities").delete().eq("id", activityId);
      activityId = null;
    }
  });

  it("운영자는 활동의 대표·부가 분야를 확정할 수 있다", async () => {
    activityId = await createTestActivity(admin);
    const asAdmin = await signInAs(TEST_USERS.admin.email);

    const { error } = await asAdmin.from("activity_fields").insert([
      { activity_id: activityId, interest_id: IT_DATA, role: "primary", source: "manual", confirmed_by: TEST_USERS.admin.id },
      { activity_id: activityId, interest_id: EDUCATION, role: "secondary", source: "manual", confirmed_by: TEST_USERS.admin.id },
    ]);
    expect(error).toBeNull();

    const { data } = await admin.from("activity_fields").select("interest_id, role").eq("activity_id", activityId);
    expect(data).toHaveLength(2);
  });

  it("일반 사용자는 분야를 확정할 수 없다", async () => {
    activityId = await createTestActivity(admin);
    const asStudent1 = await signInAs(TEST_USERS.student1.email);

    const { error, data } = await asStudent1
      .from("activity_fields")
      .insert({ activity_id: activityId, interest_id: IT_DATA, role: "primary", source: "manual" })
      .select();
    expect(error !== null || (data?.length ?? 0) === 0).toBe(true);

    const { data: check } = await admin.from("activity_fields").select("id").eq("activity_id", activityId);
    expect(check?.length ?? 0).toBe(0);
  });

  it("활동당 대표(primary) 분야는 1개만 허용된다", async () => {
    activityId = await createTestActivity(admin);
    const { error: firstError } = await admin
      .from("activity_fields")
      .insert({ activity_id: activityId, interest_id: IT_DATA, role: "primary", source: "manual" });
    expect(firstError).toBeNull();

    const { error: secondError } = await admin
      .from("activity_fields")
      .insert({ activity_id: activityId, interest_id: EDUCATION, role: "primary", source: "manual" });
    expect(secondError).not.toBeNull();
  });

  it("같은 활동에 같은 분야를 두 번 확정할 수 없다 (activity_id, interest_id 유니크)", async () => {
    activityId = await createTestActivity(admin);
    await admin.from("activity_fields").insert({ activity_id: activityId, interest_id: IT_DATA, role: "primary", source: "manual" });
    const { error } = await admin
      .from("activity_fields")
      .insert({ activity_id: activityId, interest_id: IT_DATA, role: "secondary", source: "manual" });
    expect(error).not.toBeNull();
  });

  it("비로그인 사용자는 공개된 활동의 분야를 조회할 수 있지만, 비공개 활동의 분야는 볼 수 없다", async () => {
    activityId = await createTestActivity(admin, { status: "draft" });
    await admin.from("activity_fields").insert({ activity_id: activityId, interest_id: IT_DATA, role: "primary", source: "manual" });

    const { createAnonClient } = await import("./helpers");
    const anon = createAnonClient();
    const { data: hiddenRead } = await anon.from("activity_fields").select("id").eq("activity_id", activityId);
    expect(hiddenRead?.length ?? 0).toBe(0);

    await admin.from("activities").update({ status: "published" }).eq("id", activityId);
    const { data: visibleRead } = await anon.from("activity_fields").select("id").eq("activity_id", activityId);
    expect(visibleRead?.length ?? 0).toBe(1);
  });
});

describe("activities — 지원 자격 범위(eligibility_scope)와 전공 관련성 분리", () => {
  const admin = createAdminClient();
  let activityId: string | null = null;

  afterEach(async () => {
    if (activityId) {
      await admin.from("activities").delete().eq("id", activityId);
      activityId = null;
    }
  });

  it("eligibility_scope='restricted'인데 지정 전공이 비어 있으면 거부된다", async () => {
    const { error } = await admin.from("activities").insert({
      title: `제약 테스트 ${Date.now()}`,
      status: "draft",
      is_demo: true,
      eligibility_scope: "restricted",
      eligible_major_ids: [],
    });
    expect(error).not.toBeNull();
  });

  it("eligibility_scope='restricted'이고 지정 전공이 있으면 등록된다", async () => {
    activityId = await createTestActivity(admin, { eligibility_scope: "restricted", eligible_major_ids: [CS_MAJOR] });
    const { data } = await admin.from("activities").select("eligibility_scope, eligible_major_ids").eq("id", activityId).single();
    expect(data!.eligibility_scope).toBe("restricted");
    expect(data!.eligible_major_ids).toEqual([CS_MAJOR]);
  });

  it("기본값은 'unknown'(확인 필요)이고 전공 제한 없이도 등록된다", async () => {
    activityId = await createTestActivity(admin);
    const { data } = await admin.from("activities").select("eligibility_scope, eligible_major_ids").eq("id", activityId).single();
    expect(data!.eligibility_scope).toBe("unknown");
    expect(data!.eligible_major_ids).toEqual([]);
  });

  it("일반 사용자는 활동의 지원 자격 필드를 수정할 수 없다", async () => {
    activityId = await createTestActivity(admin);
    const asStudent1 = await signInAs(TEST_USERS.student1.email);
    const { error, data } = await asStudent1
      .from("activities")
      .update({ eligibility_scope: "any" })
      .eq("id", activityId)
      .select();
    expect(error !== null || (data?.length ?? 0) === 0).toBe(true);
  });
});

describe("app_settings — recommendation_modes(G2, 가이드 3.7)", () => {
  it("모든 모드의 가중치 합이 1이다", async () => {
    const admin = createAdminClient();
    const { data } = await admin.from("app_settings").select("value").eq("key", "recommendation_modes").single();
    const value = data!.value as Record<string, Record<string, number>>;
    for (const mode of ["balanced", "major_focus", "interest_expand", "no_major"]) {
      const weights = value[mode];
      expect(weights).toBeDefined();
      const sum = Object.values(weights).reduce((s, w) => s + w, 0);
      expect(sum).toBeCloseTo(1, 10);
    }
  });

  it("일반 사용자는 recommendation_modes 설정을 수정할 수 없다", async () => {
    const asStudent1 = await signInAs(TEST_USERS.student1.email);
    const { error, data } = await asStudent1
      .from("app_settings")
      .update({ value: { balanced: { interest: 1 } } })
      .eq("key", "recommendation_modes")
      .select();
    expect(error !== null || (data?.length ?? 0) === 0).toBe(true);
  });
});
