import { test, expect } from "@playwright/test";

test("활동 필터가 URL에 반영되고 새로고침·공유 시 복원된다", async ({ page }) => {
  await page.goto("/activities");

  await page.getByLabel("키워드 검색").fill("공모전");
  await page.locator('select[name="status"]').selectOption("open");
  await page.locator('select[name="mode"]').selectOption("online");
  await page.getByRole("button", { name: "검색" }).click();

  await expect(page).toHaveURL(/q=%EA%B3%B5%EB%AA%A8%EC%A0%84/);
  await expect(page).toHaveURL(/status=open/);
  await expect(page).toHaveURL(/mode=online/);

  const urlAfterFilter = page.url();

  // 새로고침 후에도 동일한 조건이 폼에 복원된다.
  await page.reload();
  await expect(page.getByLabel("키워드 검색")).toHaveValue("공모전");
  await expect(page.locator('select[name="status"]')).toHaveValue("open");
  await expect(page.locator('select[name="mode"]')).toHaveValue("online");

  // 같은 URL을 "공유"한 것처럼 새 컨텍스트에서 직접 열어도 동일하게 복원된다.
  await page.goto("about:blank");
  await page.goto(urlAfterFilter);
  await expect(page.getByLabel("키워드 검색")).toHaveValue("공모전");
  await expect(page.locator('select[name="status"]')).toHaveValue("open");
});
