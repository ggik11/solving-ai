import { test, expect, type Page } from "@playwright/test";
import { fetchLatestMagicLink } from "./mailpit";
import { createAdminClient, TEST_USERS } from "../rls/helpers";

// G3 보완 — docs/teachable-machine-integration.md 가이드 5.4 5번. 등록 화면에서 고른 분야가
// 저장과 함께 확정되어, 관리자가 수정 화면에서 포스터를 다시 골라 재분석하지 않아도 된다는
// 것을 실제 화면으로 확인한다. 이 저장소에는 아직 모델 파일이 없으므로(가이드 9장 G3), 모델
// 후보 칩이 아니라 분야 선택 칸을 수동으로 채우는 경로로 "저장 시 사라지지 않음"을 검증한다 —
// 모델 수락 경로(accepted_model_candidate)는 DB 테스트(tests/rls/atomic_field_confirmation.test.ts)
// 쪽에서 이미 검증했다.

const IT_DATA = "c0000000-0000-0000-0000-000000000002"; // interests.code='IT_DATA'

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("학교 이메일").fill(email);
  await page.getByRole("button", { name: "매직링크 보내기" }).click();
  await expect(page.getByText(`${email}로 로그인 링크를 보냈어요.`)).toBeVisible();
  const magicLink = await fetchLatestMagicLink(email);
  await page.goto(magicLink);
}

test("등록 화면에서 분야를 선택해 저장하면, 재분석 없이 수정 화면에 분야가 이미 확정돼 있다", async ({ page }) => {
  const admin = createAdminClient();
  const activityTitle = `G3 원자적 등록 테스트 활동 ${Date.now()}`;

  await loginAs(page, TEST_USERS.admin.email);
  await page.goto("/admin/activities/new");

  await page.getByLabel("제목 *").fill(activityTitle);
  await page.getByRole("heading", { name: "분야 선택" }).scrollIntoViewIfNeeded();
  await page.getByLabel("대표 분야").selectOption({ label: "IT·AI·데이터" });
  await page.getByRole("button", { name: "등록" }).click();
  await expect(page).toHaveURL("/admin/activities");

  const { data: created, error } = await admin.from("activities").select("id").eq("title", activityTitle).single();
  if (error || !created) throw new Error(`등록된 활동을 찾지 못했습니다: ${error?.message}`);
  const activityId = created.id as string;

  try {
    // DB에서도 분야가 확정값(activity_fields)으로 바로 들어가 있어야 한다 — poster_analyses는
    // 분석을 하지 않았으므로 0건이다(수동 선택만으로도 저장이 사라지지 않음을 보여준다).
    const { data: fields } = await admin.from("activity_fields").select("interest_id, role, source").eq("activity_id", activityId);
    expect(fields).toEqual([{ interest_id: IT_DATA, role: "primary", source: "manual" }]);

    // 수정 화면을 열어도 포스터를 다시 고르거나 재분석할 필요 없이 "분야 확정" 섹션에 이미
    // 채워져 있다.
    await page.goto(`/admin/activities/${activityId}/edit`);
    await page.getByRole("heading", { name: "분야 확정" }).scrollIntoViewIfNeeded();
    await expect(page.getByLabel("대표 분야")).toHaveValue(IT_DATA);

    // 활동 상세에도 확정된 분야가 그대로 보인다.
    await page.goto(`/activities/${activityId}`);
    await expect(page.getByText("대표 · IT·AI·데이터")).toBeVisible();
  } finally {
    await admin.from("activities").delete().eq("id", activityId);
  }
});
