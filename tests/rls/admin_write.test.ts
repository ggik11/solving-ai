import { describe, expect, it } from "vitest";
import { createAdminClient, signInAs, TEST_USERS } from "./helpers";

// "일반 사용자가 관리자 권한으로 쓰기를 시도" 시나리오.
describe("일반 사용자의 관리자 전용 쓰기 시도", () => {
  it("활동을 새로 등록할 수 없다 (활동 CRUD는 운영자만, 6장 권한표)", async () => {
    const asStudent1 = await signInAs(TEST_USERS.student1.email);
    const { error, data } = await asStudent1
      .from("activities")
      .insert({ title: "일반 사용자가 올린 활동", status: "published" })
      .select();
    expect(error !== null || (data?.length ?? 0) === 0).toBe(true);
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
});
