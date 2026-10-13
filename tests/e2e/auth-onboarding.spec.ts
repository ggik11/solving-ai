import { test, expect } from "@playwright/test";
import { fetchLatestMagicLink } from "./mailpit";

test("비회원 탐색 → 로그인(로컬 메일 확인) → 온보딩(전공·관심분야 우선순위·추천 모드 포함) → 새로고침 후 유지", async ({ page }) => {
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

  // 3. 온보딩: 닉네임
  await expect(page.getByRole("heading", { name: "프로필을 완성해 주세요" })).toBeVisible();
  const nickname = `e2e테스터${Date.now() % 100000}`;
  await page.getByLabel(/닉네임/).fill(nickname);
  await page.getByRole("button", { name: "다음" }).click();

  // 소속: 전공 상태 + 전공 선택 (G1에서 추가된 화면) — 첫 선택은 자동으로 주전공이 된다.
  await expect(page.getByRole("heading", { name: "소속" })).toBeVisible();
  await page.getByRole("button", { name: "전공이 있어요" }).click();
  await expect(page.getByRole("button", { name: "전공이 있어요" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "컴퓨터과학전공 (SW융합학부)" }).click();
  await expect(page.getByText("선택한 전공")).toBeVisible();
  await expect(page.locator("span", { hasText: "컴퓨터과학전공 (SW융합학부)" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "주전공" })).toBeChecked();
  await page.getByRole("button", { name: "다음" }).click();

  // 관심분야: 다중 선택 + 우선순위 토글/재정렬 (G1에서 추가된 화면)
  await expect(page.getByRole("heading", { name: "관심분야" })).toBeVisible();
  await page.getByRole("button", { name: "IT·AI·데이터" }).click();
  await page.getByRole("button", { name: "교육·멘토링" }).click();
  await page.getByText("우선순위를 매길래요").click();
  await expect(page.getByText("1. IT·AI·데이터")).toBeVisible();
  await expect(page.getByText("2. 교육·멘토링")).toBeVisible();
  // 두 번째 항목(교육·멘토링)을 올려서 순서를 뒤집는다 — 첫 항목의 "올리기"는 비활성화돼 있다.
  await page.getByRole("button", { name: "우선순위 올리기" }).nth(1).click();
  await expect(page.getByText("1. 교육·멘토링")).toBeVisible();
  await expect(page.getByText("2. IT·AI·데이터")).toBeVisible();
  await page.getByRole("button", { name: "다음" }).click();

  // 희망 활동 / 할 수 있는 역할: 건너뛰기
  await page.getByRole("button", { name: "건너뛰기" }).click();
  await page.getByRole("button", { name: "건너뛰기" }).click();

  // 참여 조건: 추천 모드 선택 (G1에서 추가된 화면)
  await expect(page.getByRole("heading", { name: "참여 조건" })).toBeVisible();
  await page.getByRole("radio", { name: /전공 중심/ }).check();
  await page.getByRole("button", { name: "다음" }).click();

  // 가능한 시간 / 선택 정보: 건너뛰기
  await page.getByRole("button", { name: "건너뛰기" }).click();
  await page.getByRole("button", { name: "건너뛰기" }).click();

  // 공개 설정: 완료 (마지막 스텝)
  await expect(page.getByRole("heading", { name: "공개 설정" })).toBeVisible();
  await page.getByRole("button", { name: "완료" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: `${nickname}님, 안녕하세요` })).toBeVisible();

  // 4. 새로고침 후에도 로그인·온보딩 상태가 유지된다.
  await page.reload();
  await expect(page.getByRole("heading", { name: `${nickname}님, 안녕하세요` })).toBeVisible();

  await page.goto("/me");
  await expect(page.getByText(nickname)).toBeVisible();

  // 5. 프로필 수정 화면에서 전공 상태/전공/관심분야 우선순위/추천 모드가 실제로 복원된다.
  await page.goto("/me/edit");
  await expect(page.getByRole("button", { name: "전공이 있어요" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("span", { hasText: "컴퓨터과학전공 (SW융합학부)" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "주전공" })).toBeChecked();
  await expect(page.getByText("1. 교육·멘토링")).toBeVisible();
  await expect(page.getByText("2. IT·AI·데이터")).toBeVisible();
  await expect(page.getByRole("radio", { name: /전공 중심/ })).toBeChecked();
});
