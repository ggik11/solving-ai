import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient, signInAs, TEST_USERS } from "./helpers";

// 4-A단계: 알림 읽음 처리 함수(mark_notification_read/mark_all_notifications_read)와
// notifications_update RLS(운영자 전용으로 좁힘)를 검증한다.

async function insertNotification(profileId: string, dedupeKey: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("notifications")
    .insert({
      profile_id: profileId,
      type: "test_event",
      target_type: "party",
      target_id: null,
      title: "테스트 알림",
      body: "테스트용으로 생성된 알림입니다.",
      dedupe_key: dedupeKey,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`알림 생성 실패: ${error?.message}`);
  return data.id as string;
}

describe("알림 읽음 처리 — DB 함수/RLS", () => {
  const createdIds: string[] = [];

  afterEach(async () => {
    const admin = createAdminClient();
    if (createdIds.length > 0) {
      await admin.from("notifications").delete().in("id", createdIds);
      createdIds.length = 0;
    }
  });

  it("본인 알림만 mark_notification_read로 읽음 처리할 수 있다", async () => {
    const dedupeKey = `test:${Date.now()}-${Math.random()}`;
    const notificationId = await insertNotification(TEST_USERS.student1.id, dedupeKey);
    createdIds.push(notificationId);

    const outsider = await signInAs(TEST_USERS.student2.email);
    const { error: outsiderError } = await outsider.rpc("mark_notification_read", { p_notification_id: notificationId });
    expect(outsiderError).toBeNull(); // 함수 자체는 에러를 내지 않지만(본인 소유가 아니면 0행 매칭)

    const admin = createAdminClient();
    const { data: afterOutsider } = await admin.from("notifications").select("read_at").eq("id", notificationId).single();
    expect(afterOutsider?.read_at).toBeNull(); // 다른 사용자가 읽음 처리해도 실제로는 바뀌지 않는다

    const owner = await signInAs(TEST_USERS.student1.email);
    const { error: ownerError } = await owner.rpc("mark_notification_read", { p_notification_id: notificationId });
    expect(ownerError).toBeNull();

    const { data: afterOwner } = await admin.from("notifications").select("read_at").eq("id", notificationId).single();
    expect(afterOwner?.read_at).not.toBeNull();
  });

  it("mark_all_notifications_read는 본인의 안 읽은 알림만 읽음 처리한다", async () => {
    const mine1 = await insertNotification(TEST_USERS.student3.id, `test:${Date.now()}-a`);
    const mine2 = await insertNotification(TEST_USERS.student3.id, `test:${Date.now()}-b`);
    const others = await insertNotification(TEST_USERS.student4.id, `test:${Date.now()}-c`);
    createdIds.push(mine1, mine2, others);

    const student3 = await signInAs(TEST_USERS.student3.email);
    const { error } = await student3.rpc("mark_all_notifications_read");
    expect(error).toBeNull();

    const admin = createAdminClient();
    const { data: mineRows } = await admin.from("notifications").select("read_at").in("id", [mine1, mine2]);
    expect(mineRows?.every((r) => r.read_at !== null)).toBe(true);

    const { data: othersRow } = await admin.from("notifications").select("read_at").eq("id", others).single();
    expect(othersRow?.read_at).toBeNull();
  });

  it("notifications 테이블을 직접 UPDATE하는 것은 거부된다(함수 경유 강제)", async () => {
    const notificationId = await insertNotification(TEST_USERS.student1.id, `test:${Date.now()}-direct`);
    createdIds.push(notificationId);

    const owner = await signInAs(TEST_USERS.student1.email);
    const { data, error } = await owner
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .select();

    expect(error !== null || (data?.length ?? 0) === 0).toBe(true);

    const admin = createAdminClient();
    const { data: check } = await admin.from("notifications").select("read_at").eq("id", notificationId).single();
    expect(check?.read_at).toBeNull();
  });
});
