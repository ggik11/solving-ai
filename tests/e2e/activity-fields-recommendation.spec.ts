import { test, expect, type Page } from "@playwright/test";
import { fetchLatestMagicLink } from "./mailpit";
import { createAdminClient, TEST_USERS } from "../rls/helpers";

// G2(추천 개편과 자격 분리) end-to-end 확인. docs/teachable-machine-integration.md 9장 G2,
// 8장 체크리스트 4번("전공·관심·모드를 바꾸면 추천이 갱신된다")·11번("예비 모델 밖 8개 분야도
// 수동 태그로 등록·추천된다"). "스포츠·운동·건강관리"는 예비 모델의 4클래스(IT_DATA/
// BUSINESS_PLANNING/DESIGN_MEDIA/SOCIAL_ENVIRONMENT) 밖의 분야라 수동 확정만으로 추천에
// 반영되는지를 보여주는 의도적 선택이다.

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("학교 이메일").fill(email);
  await page.getByRole("button", { name: "매직링크 보내기" }).click();
  await expect(page.getByText(`${email}로 로그인 링크를 보냈어요.`)).toBeVisible();
  const magicLink = await fetchLatestMagicLink(email);
  await page.goto(magicLink);
}

test("관리자가 분야를 수동 확정하면, 그 분야를 관심분야로 고른 신규 사용자에게 추천 근거로 나타난다", async ({ page }) => {
  const admin = createAdminClient();
  const activityTitle = `G2 분야 확정 테스트 활동 ${Date.now()}`;

  const { data: activity, error: activityError } = await admin
    .from("activities")
    .insert({ title: activityTitle, status: "published", participation_mode: "solo", is_demo: true })
    .select("id")
    .single();
  if (activityError || !activity) throw new Error(`테스트 활동 생성 실패: ${activityError?.message}`);
  const activityId = activity.id as string;

  try {
    // 1. 관리자가 새 "분야 확정" UI로 대표 분야를 "스포츠·운동·건강관리"로 확정한다.
    await loginAs(page, TEST_USERS.admin.email);
    await page.goto(`/admin/activities/${activityId}/edit`);
    await page.getByRole("heading", { name: "분야 확정" }).scrollIntoViewIfNeeded();
    await page.getByLabel("대표 분야").selectOption({ label: "스포츠·운동·건강관리" });
    await page.getByRole("button", { name: "분야 저장" }).click();
    await expect(page.getByText("분야를 저장했어요.")).toBeVisible();

    // 활동 상세에서도 "대표 · 스포츠·운동·건강관리" 분야 칩이 보인다.
    await page.goto(`/activities/${activityId}`);
    await expect(page.getByText("대표 · 스포츠·운동·건강관리")).toBeVisible();

    await page.context().clearCookies();

    // 2. 신규 사용자가 온보딩에서 "스포츠·운동·건강관리"만 관심분야로 고른다(전공은 선택하지 않음).
    const email = `e2e-g2-${Date.now()}@smu.ac.kr`;
    await loginAs(page, email);

    await expect(page.getByRole("heading", { name: "프로필을 완성해 주세요" })).toBeVisible();
    const nickname = `g2테스터${Date.now() % 100000}`;
    await page.getByLabel(/닉네임/).fill(nickname);
    await page.getByRole("button", { name: "다음" }).click();

    // 소속: 전공은 선택하지 않고 건너뛴다.
    await expect(page.getByRole("heading", { name: "소속" })).toBeVisible();
    await page.getByRole("button", { name: "건너뛰기" }).click();

    // 관심분야: 스포츠·운동·건강관리만 선택한다.
    await expect(page.getByRole("heading", { name: "관심분야" })).toBeVisible();
    await page.getByRole("button", { name: "스포츠·운동·건강관리" }).click();
    await page.getByRole("button", { name: "다음" }).click();

    // 나머지 스텝은 "완료"가 나올 때까지 건너뛴다.
    const complete = page.getByRole("button", { name: "완료" });
    for (let i = 0; i < 20 && !(await complete.isVisible()); i++) {
      const skip = page.getByRole("button", { name: "건너뛰기" });
      if (await skip.isVisible()) await skip.click();
      else await page.getByRole("button", { name: "다음" }).click();
    }
    await complete.click();
    await expect(page).toHaveURL("/");

    // 3. 그 활동 상세에서 "추천 근거"에 관심분야 일치 문구가 실제로 나타난다.
    await page.goto(`/activities/${activityId}`);
    const evidence = page.getByRole("heading", { name: "추천 근거" }).locator("..");
    await expect(evidence.getByText(/점$/)).toBeVisible();
    await expect(evidence.getByText("선택한 '스포츠·운동·건강관리' 관심분야와 일치")).toBeVisible();
  } finally {
    await admin.from("activities").delete().eq("id", activityId);
  }
});
