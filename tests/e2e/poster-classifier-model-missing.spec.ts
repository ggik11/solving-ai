import { test, expect, type Page } from "@playwright/test";
import { fetchLatestMagicLink } from "./mailpit";
import { createAdminClient, TEST_USERS } from "../rls/helpers";

// G3(티처블 머신 연동 골격) — 체크리스트 6번("모델 미설치 상태에서 등록·확정·추천이 모두 정상
// 동작한다")을 실제 화면으로 확인한다. 이 저장소에는 아직 모델 파일을 넣지 않았으므로(가이드
// 9장 G3: "모델 파일은 아직 없으니 가짜 모델이나 임의 예측값은 만들지 않는다"), 여기서는 가짜
// 모델을 흉내 내지 않고 "모델이 실제로 없을 때" 진짜로 벌어지는 일을 그대로 검증한다 —
// 분석은 failed(model_missing)로 끝나고, 그 아래 분야 확정 화면은 평소처럼 정상 동작해야 한다.

// 최소 유효 PNG(1x1 투명 픽셀) — 내용 자체는 중요하지 않다(모델 로딩이 이미지 디코드보다 먼저
// 실패하므로 이 바이트까지 도달하지 않는다), 그래도 실제 이미지 파일을 쓰는 게 더 사실적이다.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("학교 이메일").fill(email);
  await page.getByRole("button", { name: "매직링크 보내기" }).click();
  await expect(page.getByText(`${email}로 로그인 링크를 보냈어요.`)).toBeVisible();
  const magicLink = await fetchLatestMagicLink(email);
  await page.goto(magicLink);
}

test("모델 파일이 없는 상태에서 포스터 분석은 실패로 끝나고, 그 아래 분야 확정·활동 수정은 정상 동작한다", async ({ page }) => {
  const admin = createAdminClient();
  const activityTitle = `G3 모델 미설치 테스트 활동 ${Date.now()}`;
  const { data: activity, error } = await admin
    .from("activities")
    .insert({ title: activityTitle, status: "draft", participation_mode: "solo", is_demo: true })
    .select("id")
    .single();
  if (error || !activity) throw new Error(`테스트 활동 생성 실패: ${error?.message}`);
  const activityId = activity.id as string;

  try {
    await loginAs(page, TEST_USERS.admin.email);
    await page.goto(`/admin/activities/${activityId}/edit`);

    await page.getByLabel("포스터 이미지 선택").setInputFiles({
      name: "poster.png",
      mimeType: "image/png",
      buffer: Buffer.from(TINY_PNG_BASE64, "base64"),
    });

    await expect(page.getByText("모델을 아직 사용할 수 없어요. 분야를 직접 선택해 주세요.")).toBeVisible();

    // 모델 실패와 무관하게 분야 확정 화면은 그대로 쓸 수 있다.
    await page.getByRole("heading", { name: "분야 확정" }).scrollIntoViewIfNeeded();
    await page.getByLabel("대표 분야").selectOption({ label: "스포츠·운동·건강관리" });
    await page.getByRole("button", { name: "분야 저장" }).click();
    await expect(page.getByText("분야를 저장했어요.")).toBeVisible();

    // 이 활동에 저장된 분석 결과가 failed(model_missing)로 남아 있다 — 점수 0이나 특정 분야로
    // 둔갑하지 않는다(체크리스트 7번). PosterClassifierPanel이 저장을 시도했는지는 "분석 이력"
    // 섹션으로 확인한다.
    await expect(page.getByRole("heading", { name: "포스터 분석 이력" }).locator("..")).toContainText("실패");

    // 활동 수정 자체도 모델과 무관하게 정상 동작한다.
    await page.getByLabel("공개 상태").selectOption({ label: "공개" });
    await page.getByRole("button", { name: "수정 저장" }).click();
    await expect(page).toHaveURL("/admin/activities");
  } finally {
    await admin.from("activities").delete().eq("id", activityId);
  }
});
