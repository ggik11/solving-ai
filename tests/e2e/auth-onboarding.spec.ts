import { test, expect } from "@playwright/test";
import { fetchLatestMagicLink } from "./mailpit";

test("비회원 탐색 → 로그인(로컬 메일 확인) → 온보딩 → 새로고침 후 유지", async ({ page }) => {
  // 1. 비회원 탐색: 로그인 없이 활동 목록을 볼 수 있다.
  await page.goto("/");
  await expect(page.getByRole("link", { name: "로그인" })).toBeVisible();
  await page.getByRole("link", { name: "전체 활동 보기" }).click();
  await expect(page.getByRole("heading", { name: "활동 탐색" })).toBeVisible();
  await expect(page.getByText(/총 \d+건/)).toBeVisible();

  // 2. 로그인: 매직링크 요청 후 로컬 메일(Mailpit)에서 링크를 확인한다.
  const email = `e2e-${Date.now()}@smu.ac.kr`;
  await page.goto("/login");
  await page.getByLabel("학교 이메일").fill(email);
  await page.getByRole("button", { name: "매직링크 보내기" }).click();
  await expect(page.getByText(`${email}로 로그인 링크를 보냈어요.`)).toBeVisible();

  const magicLink = await fetchLatestMagicLink(email);
  await page.goto(magicLink);

  // 3. 온보딩: 닉네임만 입력하고 나머지는 건너뛰어도 완료할 수 있다.
  await expect(page.getByRole("heading", { name: "프로필을 완성해 주세요" })).toBeVisible();
  const nickname = `e2e테스터${Date.now() % 100000}`;
  await page.getByLabel(/닉네임/).fill(nickname);
  await page.getByRole("button", { name: "다음" }).click();

  // "완료" 버튼이 나타날 때까지 건너뛰기/다음을 반복한다 (스텝 수가 바뀌어도 깨지지 않게).
  const complete = page.getByRole("button", { name: "완료" });
  for (let i = 0; i < 20 && !(await complete.isVisible()); i++) {
    const skip = page.getByRole("button", { name: "건너뛰기" });
    if (await skip.isVisible()) {
      await skip.click();
    } else {
      await page.getByRole("button", { name: "다음" }).click();
    }
  }

  await expect(complete).toBeVisible();
  await complete.click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: `${nickname}님, 안녕하세요` })).toBeVisible();

  // 4. 새로고침 후에도 로그인·온보딩 상태가 유지된다.
  await page.reload();
  await expect(page.getByRole("heading", { name: `${nickname}님, 안녕하세요` })).toBeVisible();

  await page.goto("/me");
  await expect(page.getByText(nickname)).toBeVisible();
});
