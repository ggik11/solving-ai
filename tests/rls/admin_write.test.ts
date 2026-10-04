import { describe, expect, it } from "vitest";
import { createAdminClient, signInAs, TEST_USERS } from "./helpers";

// "일반 사용자가 관리자 권한으로 쓰기를 시도" 시나리오 (지시서 13장 "권한 위조", "운영자 CSV").
describe("일반 사용자의 관리자 전용 쓰기 시도", () => {
  it("활동을 새로 등록할 수 없다 (활동 CRUD는 운영자만, 6장 권한표)", async () => {
    const asStudent1 = await signInAs(TEST_USERS.student1.email);
    const { error, data } = await asStudent1
      .from("activities")
      .insert({ title: "일반 사용자가 올린 활동", status: "published" })
      .select();
    expect(error !== null || (data?.length ?? 0) === 0).toBe(true);
  });

  it("다른 사람의 활동을 수정(공개 전환 등)할 수 없다 (활동 수정은 운영자만)", async () => {
    const admin = createAdminClient();
    const { data: activity } = await admin
      .from("activities")
      .insert({ title: "권한 위조 테스트용 활동", status: "draft", is_demo: true })
      .select("id")
      .single();

    const asStudent1 = await signInAs(TEST_USERS.student1.email);
    const { error, data } = await asStudent1
      .from("activities")
      .update({ status: "published", title: "해킹된 제목" })
      .eq("id", activity!.id)
      .select();
    expect(error !== null || (data?.length ?? 0) === 0).toBe(true);

    const { data: check } = await admin.from("activities").select("status, title").eq("id", activity!.id).single();
    expect(check!.status).toBe("draft");
    expect(check!.title).toBe("권한 위조 테스트용 활동");

    await admin.from("activities").delete().eq("id", activity!.id);
  });

  it("스스로에게 관리자 권한을 부여할 수 없다 (user_roles)", async () => {
    const asStudent1 = await signInAs(TEST_USERS.student1.email);
    const { error, data } = await asStudent1
      .from("user_roles")
      .insert({ profile_id: TEST_USERS.student1.id, role: "admin" })
      .select();
    expect(error !== null || (data?.length ?? 0) === 0).toBe(true);

    const admin = createAdminClient();
    const { data: check } = await admin
      .from("user_roles")
      .select("profile_id")
      .eq("profile_id", TEST_USERS.student1.id);
    expect(check?.length ?? 0).toBe(0);
  });

  it("app_settings(허용 이메일 도메인 등)를 수정할 수 없다", async () => {
    const asStudent1 = await signInAs(TEST_USERS.student1.email);
    const { error, data } = await asStudent1
      .from("app_settings")
      .update({ value: ["hacked.com"] })
      .eq("key", "allowed_email_domains")
      .select();
    expect(error !== null || (data?.length ?? 0) === 0).toBe(true);
  });

  it("majors 참조 테이블에 새 전공을 추가할 수 없다", async () => {
    const asStudent1 = await signInAs(TEST_USERS.student1.email);
    const { error, data } = await asStudent1
      .from("majors")
      .insert({ college: "x", department: "y", name: "z" })
      .select();
    expect(error !== null || (data?.length ?? 0) === 0).toBe(true);
  });

  it("반대로 운영자 계정은 위 쓰기 작업을 수행할 수 있다 (양성 대조)", async () => {
    const asAdmin = await signInAs(TEST_USERS.admin.email);
    const { error, data } = await asAdmin
      .from("majors")
      .insert({ college: "테스트대학", department: "테스트학부", name: "RLS 테스트 전공", is_demo: true })
      .select();
    expect(error).toBeNull();
    expect(data?.length).toBe(1);

    if (data?.[0]?.id) {
      const admin = createAdminClient();
      await admin.from("majors").delete().eq("id", data[0].id);
    }
  });

  it("운영자는 CSV 가져오기와 같은 모양으로 활동을 일괄 등록할 수 있다 (비공개로 생성)", async () => {
    // bulkImportActivities(src/app/admin/activities/actions.ts)가 실제로 보내는 것과 같은
    // 모양 — status는 항상 'draft'로 강제되고 운영자가 나중에 검토 후 공개 전환한다.
    const asAdmin = await signInAs(TEST_USERS.admin.email);
    const rows = [
      { title: `CSV 테스트 행 1 ${Date.now()}`, status: "draft", is_demo: false, created_by: TEST_USERS.admin.id },
      { title: `CSV 테스트 행 2 ${Date.now()}`, status: "draft", is_demo: false, created_by: TEST_USERS.admin.id },
    ];
    const { data, error } = await asAdmin.from("activities").insert(rows).select("id, status");
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    expect(data!.every((r) => r.status === "draft")).toBe(true);

    const admin = createAdminClient();
    await admin.from("activities").delete().in("id", data!.map((r) => r.id));
  });

  it("일반 사용자는 같은 모양으로도 활동을 일괄 등록할 수 없다", async () => {
    const asStudent1 = await signInAs(TEST_USERS.student1.email);
    const rows = [
      { title: `권한없는 CSV 시도 1 ${Date.now()}`, status: "draft", is_demo: false },
      { title: `권한없는 CSV 시도 2 ${Date.now()}`, status: "draft", is_demo: false },
    ];
    const { error, data } = await asStudent1.from("activities").insert(rows).select();
    expect(error !== null || (data?.length ?? 0) === 0).toBe(true);
  });
});
