import { test, expect } from "@playwright/test";

// 2-A 단계에는 아직 실제 화면이 없다(2-B에서 구현). Playwright 배선 자체가
// 동작하는지만 확인하는 스모크 테스트이며, 화면이 생기면 교체한다.
test("기본 페이지가 응답한다", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBeTruthy();
});
