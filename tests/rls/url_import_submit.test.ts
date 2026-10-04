import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient, signInAs, TEST_USERS } from "./helpers";

// 링크 붙여넣기 활동 등록(3/N: 화면) — submit_activity()가 날짜·가져오기 메타데이터(파라미터
// 추가)를 받아도 기존 동작(빈도 제한, source_url 검증)이 깨지지 않는지, 새 필드가 실제로
// 저장되는지 확인한다.

describe("submit_activity — 날짜/가져오기 메타데이터 확장", () => {
  afterEach(async () => {
    const admin = createAdminClient();
    await admin.from("activities").delete().eq("created_by", TEST_USERS.student1.id).eq("is_demo", false);
  });

  it("날짜와 가져오기 메타데이터를 함께 저장한다", async () => {
    const student1 = await signInAs(TEST_USERS.student1.email);
    const { data, error } = await student1.rpc("submit_activity", {
      p_title: "URL 가져오기 테스트 활동",
      p_summary: null,
      p_description: null,
      p_org_name: "가상기관",
      p_source_url: "https://notice.example.org/events/idea-2026",
      p_location_type: "offline",
      p_region: null,
      p_participation_mode: "both",
      p_apply_start_at: "2026-10-01T00:00:00+09:00",
      p_apply_end_at: "2026-10-31T18:00:00+09:00",
      p_activity_start_at: null,
      p_activity_end_at: null,
      p_source_url_resolved: "https://notice.example.org/events/idea-2026?utm=x",
      p_apply_end_at_evidence: "2026.10.31. 18:00",
    });
    expect(error).toBeNull();
    expect(data).toBeTruthy();

    const admin = createAdminClient();
    const { data: row } = await admin.from("activities").select("*").eq("id", data as string).single();
    expect(row?.apply_start_at).not.toBeNull();
    expect(row?.apply_end_at).not.toBeNull();
    expect(row?.source_url_resolved).toBe("https://notice.example.org/events/idea-2026?utm=x");
    expect(row?.apply_end_at_evidence).toBe("2026.10.31. 18:00");
    expect(row?.needs_verification).toBe(false);
    expect(row?.status).toBe("draft");
  });

  it("날짜/가져오기 메타데이터를 생략해도(기본 호출) 그대로 동작한다", async () => {
    const student1 = await signInAs(TEST_USERS.student1.email);
    const { error } = await student1.rpc("submit_activity", {
      p_title: "기본 호출 테스트",
      p_summary: null,
      p_description: null,
      p_org_name: null,
      p_source_url: null,
      p_location_type: "offline",
      p_region: null,
      p_participation_mode: "both",
    });
    expect(error).toBeNull();
  });

  it("접수 시작일이 마감일보다 늦으면 거부한다", async () => {
    const student1 = await signInAs(TEST_USERS.student1.email);
    const { error } = await student1.rpc("submit_activity", {
      p_title: "기간 역전 테스트",
      p_summary: null,
      p_description: null,
      p_org_name: null,
      p_source_url: null,
      p_location_type: "offline",
      p_region: null,
      p_participation_mode: "both",
      p_apply_start_at: "2026-11-01T00:00:00+09:00",
      p_apply_end_at: "2026-10-01T00:00:00+09:00",
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? "").toContain("INVALID_DATE_RANGE");
  });

  it("http(s)가 아닌 원문 링크는 여전히 거부한다(기존 XSS 방어 유지)", async () => {
    const student1 = await signInAs(TEST_USERS.student1.email);
    const { error } = await student1.rpc("submit_activity", {
      p_title: "악성 링크 테스트",
      p_summary: null,
      p_description: null,
      p_org_name: null,
      p_source_url: "javascript:alert(1)",
      p_location_type: "offline",
      p_region: null,
      p_participation_mode: "both",
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? "").toContain("INVALID_SOURCE_URL");
  });

  it("예전 8개 인자 시그니처는 더 이상 존재하지 않는다(오버로드 잔존 방지 회귀 테스트)", async () => {
    const student1 = await signInAs(TEST_USERS.student1.email);
    // supabase-js는 호출 시 인자 이름을 그대로 RPC에 보내므로, 정확히 8개 키만 보내면
    // PostgREST가 시그니처를 "8개 인자"로 찾으려 한다 — 옛 오버로드가 남아있었다면 성공했을
    // 호출이, 지금은 14개 인자 버전(끝 6개가 default)만 있어도 동작해야 한다(default라 생략
    // 가능). 이 테스트는 "여러 시그니처가 동시에 존재해 모호해지는" 상황이 아님을 간접 확인한다.
    const { error } = await student1.rpc("submit_activity", {
      p_title: "시그니처 확인",
      p_summary: null,
      p_description: null,
      p_org_name: null,
      p_source_url: null,
      p_location_type: "offline",
      p_region: null,
      p_participation_mode: "both",
    });
    expect(error).toBeNull();
  });
});
