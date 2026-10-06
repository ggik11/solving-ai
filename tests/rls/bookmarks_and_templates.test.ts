import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient, signInAs, TEST_USERS } from "./helpers";

// 코드 검수(에러 유발 #2·#4)에서 고친 두 가지 에러 코드 분기가 실제 DB에서도 그 코드를 내는지
// 확인한다. 서버 액션(toggleBookmark/deleteMatchTemplateAction)은 next/headers에 의존해
// Vitest에서 직접 호출할 수 없으므로, 그 액션들이 의존하는 DB 동작 자체를 여기서 검증하고,
// 액션의 분기 로직(코드별 처리)은 순수 함수로 뽑아 단위 테스트한다
// (tests/unit/errors.test.ts의 isDuplicateKeyError).

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

describe("북마크 중복 삽입 — toggleBookmark의 멱등 처리가 의존하는 DB 동작", () => {
  let activityId: string;

  afterEach(async () => {
    if (activityId) await deleteActivity(activityId);
  });

  it("같은 (profile_id, activity_id) 북마크를 두 번 넣으면 두 번째는 23505(unique violation)다", async () => {
    activityId = await createPublishedTeamActivity(`북마크-멱등 ${Date.now()}`);
    const student1 = await signInAs(TEST_USERS.student1.email);

    const first = await student1.from("bookmarks").insert({ profile_id: TEST_USERS.student1.id, activity_id: activityId });
    expect(first.error).toBeNull();

    const second = await student1.from("bookmarks").insert({ profile_id: TEST_USERS.student1.id, activity_id: activityId });
    expect(second.error).not.toBeNull();
    expect(second.error?.code).toBe("23505");

    await student1.from("bookmarks").delete().eq("profile_id", TEST_USERS.student1.id).eq("activity_id", activityId);
  });
});

describe("빠른 매칭 템플릿 삭제 — deleteMatchTemplateAction의 원인별 메시지 분기가 의존하는 DB 동작", () => {
  let activityId: string;

  afterEach(async () => {
    if (activityId) await deleteActivity(activityId);
  });

  it("대기열이 참조 중인 템플릿을 삭제하면 23503(FK violation)이다", async () => {
    const admin = createAdminClient();
    activityId = await createPublishedTeamActivity(`템플릿삭제-사용중 ${Date.now()}`);

    const { data: template, error: templateError } = await admin
      .from("activity_match_templates")
      .insert({ activity_id: activityId, name: "삭제 테스트 템플릿" })
      .select("id")
      .single();
    expect(templateError).toBeNull();

    const { error: queueError } = await admin.from("matching_queue").insert({
      activity_id: activityId,
      profile_id: TEST_USERS.student1.id,
      template_id: template!.id,
      eligible_roles: ["기획"],
      status: "waiting",
    });
    expect(queueError).toBeNull();

    const { error: deleteError } = await admin.from("activity_match_templates").delete().eq("id", template!.id);
    expect(deleteError).not.toBeNull();
    expect(deleteError?.code).toBe("23503");

    await admin.from("matching_queue").delete().eq("template_id", template!.id);
    await admin.from("activity_match_templates").delete().eq("id", template!.id);
  });

  it("참조가 없는 템플릿은 정상적으로 삭제된다", async () => {
    const admin = createAdminClient();
    activityId = await createPublishedTeamActivity(`템플릿삭제-정상 ${Date.now()}`);

    const { data: template, error: templateError } = await admin
      .from("activity_match_templates")
      .insert({ activity_id: activityId, name: "삭제 테스트 템플릿(참조 없음)" })
      .select("id")
      .single();
    expect(templateError).toBeNull();

    const { error: deleteError } = await admin.from("activity_match_templates").delete().eq("id", template!.id);
    expect(deleteError).toBeNull();
  });
});
