import { test, expect, type Page } from "@playwright/test";
import { fetchLatestMagicLink } from "./mailpit";
import { createAdminClient, TEST_USERS } from "../rls/helpers";

// G3 보완 — docs/teachable-machine-integration.md 가이드 5.4 5번. 제보자는 분야를 "제안"만 할 수
// 있고, 관리자가 /admin/submissions 승인 화면에서 그 제안을 보고 직접 분야를 "확정"한다는 흐름을
// 실제 화면으로 확인한다. 관리자가 제보자의 제안과 다른 분야를 골라도 그대로 반영되는지까지
// 본다(확정 권한이 실제로 관리자에게 있음을 보여주기 위해).

const IT_DATA_LABEL = "IT·AI·데이터";
const EDUCATION_LABEL = "교육·멘토링";

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("학교 이메일").fill(email);
  await page.getByRole("button", { name: "매직링크 보내기" }).click();
  await expect(page.getByText(`${email}로 로그인 링크를 보냈어요.`)).toBeVisible();
  const magicLink = await fetchLatestMagicLink(email);
  await page.goto(magicLink);
}

test("제보자는 분야를 제안만 하고, 관리자가 승인 화면에서 분야를 확정한다", async ({ page }) => {
  const admin = createAdminClient();
  const activityTitle = `G3 제보 분야 승인 테스트 ${Date.now()}`;
  const reporterEmail = `e2e-g3-submit-${Date.now()}@smu.ac.kr`;

  // 1. 제보자가 "교육·멘토링"을 분야로 제안하며 제보한다.
  await loginAs(page, reporterEmail);
  await page.goto("/activities/submit");
  await page.getByLabel("제목 *").fill(activityTitle);
  await page.getByRole("heading", { name: "분야 제안 (참고용)" }).scrollIntoViewIfNeeded();
  await page.getByLabel("대표 분야 제안").selectOption({ label: EDUCATION_LABEL });
  await page.getByRole("button", { name: "제보하기" }).click();
  await expect(page).toHaveURL("/activities/submit/done");

  const { data: created, error } = await admin.from("activities").select("id").eq("title", activityTitle).single();
  if (error || !created) throw new Error(`제보된 활동을 찾지 못했습니다: ${error?.message}`);
  const activityId = created.id as string;

  try {
    // 제보자는 "제안"만 했을 뿐 확정되지 않았다 — activity_fields는 아직 비어 있다.
    const { data: beforeApproval } = await admin.from("activity_fields").select("id").eq("activity_id", activityId);
    expect(beforeApproval).toHaveLength(0);

    await page.context().clearCookies();

    // 2. 관리자가 승인 화면에서 제보자의 제안을 보고, 다른 분야("IT·AI·데이터")로 바꿔 확정한다.
    await loginAs(page, TEST_USERS.admin.email);
    await page.goto("/admin/submissions");
    const row = page.locator("li").filter({ hasText: activityTitle });
    await expect(row).toBeVisible();
    // 제보자의 제안("교육·멘토링")이 기본값으로 미리 채워져 있어야 한다.
    await expect(row.getByLabel("대표 분야 확정")).toHaveValue(/.+/);
    await row.getByLabel("대표 분야 확정").selectOption({ label: IT_DATA_LABEL });
    await row.getByRole("button", { name: "승인(공개)" }).click();
    await expect(row).not.toBeVisible();

    // 3. 공개된 활동 상세에 관리자가 확정한 분야("IT·AI·데이터")가 그대로 보인다 — 제보자의
    // 제안(교육·멘토링)이 아니라 관리자가 고른 값이다.
    await page.goto(`/activities/${activityId}`);
    await expect(page.getByText(`대표 · ${IT_DATA_LABEL}`)).toBeVisible();
    await expect(page.getByText(`대표 · ${EDUCATION_LABEL}`)).not.toBeVisible();
  } finally {
    await admin.from("activities").delete().eq("id", activityId);
  }
});
