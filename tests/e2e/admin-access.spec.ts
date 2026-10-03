import { test, expect } from "@playwright/test";
import { fetchLatestMagicLink } from "./mailpit";

const NON_ADMIN_EMAIL = "student1@smu.ac.kr"; // supabase/seed.sql의 테스트 계정 (관리자 아님)

test("일반 사용자는 관리자 화면에 접근할 수 없다", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("학교 이메일").fill(NON_ADMIN_EMAIL);
  await page.getByRole("button", { name: "매직링크 보내기" }).click();
  await expect(page.getByText(`${NON_ADMIN_EMAIL}로 로그인 링크를 보냈어요.`)).toBeVisible();

  const magicLink = await fetchLatestMagicLink(NON_ADMIN_EMAIL);
  await page.goto(magicLink);

  // 이미 온보딩이 끝난 계정이므로 홈으로 이동한다.
  await expect(page).toHaveURL("/");

  await page.goto("/admin");
  await expect(page.getByText("권한 없음")).toBeVisible();
  await expect(page.getByText("관리자만 접근할 수 있는 화면입니다.")).toBeVisible();

  await page.goto("/admin/activities/import");
  await expect(page.getByText("권한 없음")).toBeVisible();
});
