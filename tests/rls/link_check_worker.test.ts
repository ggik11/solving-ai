import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient, createAnonClient, signInAs, TEST_USERS } from "./helpers";

// 링크 붙여넣기 활동 등록(4/N: 정기 점검) — claim_activities_for_link_check()의 중복 실행
// 안전성과, record_link_check_result()의 성공/실패 기록·알림 중복 억제를 검증한다. 실제 외부
// HTTP 요청(fetchSinglePage)은 src/lib/activity-import 단위 테스트에서 이미 검증했으므로,
// 여기서는 그 결과를 "기록"하는 DB 로직만 본다.

const TITLE_PREFIX = "링크점검테스트_";

async function createTestActivity(overrides: Record<string, unknown> = {}) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("activities")
    .insert({
      title: `${TITLE_PREFIX}${Math.random().toString(36).slice(2)}`,
      status: "published",
      source_url: "https://notice.example.org/x",
      location_type: "offline",
      participation_mode: "both",
      is_demo: true,
      ...overrides,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`테스트 활동 생성 실패: ${error?.message}`);
  return data.id as string;
}

describe("claim_activities_for_link_check — 중복 실행 안전성", () => {
  afterEach(async () => {
    const admin = createAdminClient();
    await admin.from("activities").delete().like("title", `${TITLE_PREFIX}%`);
  });

  it("비로그인/일반 사용자는 호출할 수 없다", async () => {
    const anon = createAnonClient();
    const { error: anonError } = await anon.rpc("claim_activities_for_link_check", { p_limit: 5000 });
    expect(anonError).not.toBeNull();

    const student1 = await signInAs(TEST_USERS.student1.email);
    const { error: userError } = await student1.rpc("claim_activities_for_link_check", { p_limit: 5000 });
    expect(userError).not.toBeNull();
  });

  it("동시에 두 번 호출해도 같은 활동을 중복으로 가져가지 않는다", async () => {
    const ids = await Promise.all(Array.from({ length: 6 }, () => createTestActivity()));
    const admin = createAdminClient();
    const asOf = new Date().toISOString();

    const [first, second] = await Promise.all([
      admin.rpc("claim_activities_for_link_check", { p_limit: 5000, p_as_of: asOf }),
      admin.rpc("claim_activities_for_link_check", { p_limit: 5000, p_as_of: asOf }),
    ]);
    expect(first.error).toBeNull();
    expect(second.error).toBeNull();

    const firstIds = (first.data ?? []).map((a: { id: string }) => a.id).filter((id: string) => ids.includes(id));
    const secondIds = (second.data ?? []).map((a: { id: string }) => a.id).filter((id: string) => ids.includes(id));
    const overlap = firstIds.filter((id: string) => secondIds.includes(id));
    expect(overlap).toEqual([]);
    expect(firstIds.length + secondIds.length).toBe(6);
  });

  it("최근에 이미 점검을 시도한 활동은 다시 claim하지 않는다(하루 1회)", async () => {
    const id = await createTestActivity();
    const admin = createAdminClient();
    const now = new Date();

    const first = await admin.rpc("claim_activities_for_link_check", { p_limit: 5000, p_as_of: now.toISOString() });
    expect((first.data ?? []).some((a: { id: string }) => a.id === id)).toBe(true);

    // 10시간 뒤(기본 20시간 미만) 다시 시도해도 아직 claim되지 않는다.
    const soon = new Date(now.getTime() + 1000 * 60 * 60 * 10);
    const second = await admin.rpc("claim_activities_for_link_check", { p_limit: 5000, p_as_of: soon.toISOString() });
    expect((second.data ?? []).some((a: { id: string }) => a.id === id)).toBe(false);

    // 21시간 뒤(기본 20시간 경과)에는 다시 claim된다.
    const later = new Date(now.getTime() + 1000 * 60 * 60 * 21);
    const third = await admin.rpc("claim_activities_for_link_check", { p_limit: 5000, p_as_of: later.toISOString() });
    expect((third.data ?? []).some((a: { id: string }) => a.id === id)).toBe(true);
  });

  it("source_url이 없거나 공개 상태가 아닌 활동은 claim하지 않는다", async () => {
    const draftId = await createTestActivity({ status: "draft" });
    const noUrlId = await createTestActivity({ source_url: null });
    const admin = createAdminClient();
    const { data } = await admin.rpc("claim_activities_for_link_check", { p_limit: 500, p_as_of: new Date().toISOString() });
    const claimedIds = (data ?? []).map((a: { id: string }) => a.id);
    expect(claimedIds).not.toContain(draftId);
    expect(claimedIds).not.toContain(noUrlId);
  });
});

describe("record_link_check_result", () => {
  afterEach(async () => {
    const admin = createAdminClient();
    await admin.from("activities").delete().like("title", `${TITLE_PREFIX}%`);
    await admin.from("notifications").delete().eq("type", "activity_link_check_failed");
  });

  it("정상이면 last_verified_at을 갱신하고 needs_verification을 해제한다", async () => {
    const id = await createTestActivity({ needs_verification: true, verification_note: "이전 실패" });
    const admin = createAdminClient();
    const { error } = await admin.rpc("record_link_check_result", {
      p_activity_id: id,
      p_ok: true,
      p_resolved_url: "https://notice.example.org/x?final=1",
    });
    expect(error).toBeNull();

    const { data: row } = await admin.from("activities").select("*").eq("id", id).single();
    expect(row?.needs_verification).toBe(false);
    expect(row?.verification_note).toBeNull();
    expect(row?.last_verified_at).not.toBeNull();
    expect(row?.source_url_resolved).toBe("https://notice.example.org/x?final=1");
  });

  it("비정상이면 원문 확인 필요로 표시하고 운영자에게 알림을 보낸다", async () => {
    const id = await createTestActivity();
    const admin = createAdminClient();
    const { error } = await admin.rpc("record_link_check_result", {
      p_activity_id: id,
      p_ok: false,
      p_note: "HTTP_ERROR: 404",
    });
    expect(error).toBeNull();

    const { data: row } = await admin.from("activities").select("*").eq("id", id).single();
    expect(row?.needs_verification).toBe(true);
    expect(row?.verification_note).toBe("HTTP_ERROR: 404");

    const { data: notifications } = await admin
      .from("notifications")
      .select("*")
      .eq("target_id", id)
      .eq("type", "activity_link_check_failed");
    expect(notifications).toHaveLength(1);
    expect(notifications![0].profile_id).toBe(TEST_USERS.admin.id);
  });

  it("실패가 계속돼도 알림이 쌓이지 않고 1건으로 유지된다(갱신만 된다)", async () => {
    const id = await createTestActivity();
    const admin = createAdminClient();

    await admin.rpc("record_link_check_result", { p_activity_id: id, p_ok: false, p_note: "1일차 실패" });
    await admin.rpc("record_link_check_result", { p_activity_id: id, p_ok: false, p_note: "2일차 실패" });

    const { data: notifications } = await admin
      .from("notifications")
      .select("*")
      .eq("target_id", id)
      .eq("type", "activity_link_check_failed");
    expect(notifications).toHaveLength(1);
    expect(notifications![0].body).toBe("2일차 실패");
  });

  it("비로그인/일반 사용자는 호출할 수 없다", async () => {
    const id = await createTestActivity();
    const anon = createAnonClient();
    const { error: anonError } = await anon.rpc("record_link_check_result", { p_activity_id: id, p_ok: true });
    expect(anonError).not.toBeNull();

    const student1 = await signInAs(TEST_USERS.student1.email);
    const { error: userError } = await student1.rpc("record_link_check_result", { p_activity_id: id, p_ok: true });
    expect(userError).not.toBeNull();
  });
});
