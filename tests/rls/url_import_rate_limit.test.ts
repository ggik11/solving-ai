import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient, createAnonClient, signInAs, TEST_USERS } from "./helpers";

// 링크 붙여넣기 활동 등록(1/N: 가져오기·SSRF) — 실제 외부 페이지 가져오기 전에 반드시 통과해야
// 하는 빈도 제한 함수를 검증한다. 가져오기 자체(네트워크 I/O)는 tests/unit/activity-import에서
// 피처 없이(목) 검증하므로, 여기서는 DB 레벨 빈도 제한·권한만 본다.

describe("check_url_fetch_rate_limit", () => {
  afterEach(async () => {
    const admin = createAdminClient();
    await admin.from("url_fetch_log").delete().eq("profile_id", TEST_USERS.student1.id);
    await admin.from("app_settings").update({ value: { fetches_per_hour: 20 } }).eq("key", "url_import_rate_limits");
  });

  it("비로그인 사용자는 호출할 수 없다", async () => {
    const anon = createAnonClient();
    const { error } = await anon.rpc("check_url_fetch_rate_limit");
    expect(error).not.toBeNull();
  });

  it("로그인 사용자는 제한 이내에서 반복 호출할 수 있고, 제한을 넘으면 거부된다", async () => {
    const admin = createAdminClient();
    await admin.from("app_settings").update({ value: { fetches_per_hour: 3 } }).eq("key", "url_import_rate_limits");

    const student1 = await signInAs(TEST_USERS.student1.email);

    for (let i = 0; i < 3; i++) {
      const { error } = await student1.rpc("check_url_fetch_rate_limit");
      expect(error, `호출 ${i + 1}번째는 통과해야 함`).toBeNull();
    }

    const { error: fourthError } = await student1.rpc("check_url_fetch_rate_limit");
    expect(fourthError).not.toBeNull();
    expect(fourthError?.message ?? "").toContain("RATE_LIMITED");
  });

  it("정지된 계정은 호출할 수 없다", async () => {
    const admin = createAdminClient();
    const studentAdmin = await signInAs(TEST_USERS.admin.email);
    await studentAdmin.rpc("suspend_account", { p_profile_id: TEST_USERS.student2.id, p_reason: "테스트" });

    try {
      const student2 = await signInAs(TEST_USERS.student2.email);
      const { error } = await student2.rpc("check_url_fetch_rate_limit");
      expect(error).not.toBeNull();
      expect(error?.message ?? "").toContain("ACCOUNT_SUSPENDED");
    } finally {
      await studentAdmin.rpc("unsuspend_account", { p_profile_id: TEST_USERS.student2.id });
      await admin.from("url_fetch_log").delete().eq("profile_id", TEST_USERS.student2.id);
    }
  });
});
