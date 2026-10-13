import { test, expect, type Page } from "@playwright/test";
import { fetchLatestMagicLink } from "./mailpit";
import { TEST_USERS } from "../rls/helpers";

// G4(실험 도구) — docs/teachable-machine-integration.md 9장 G4, 6.3절. 완료 기준
// "목 예측으로 평가 화면 E2E 1건"을 그대로 충족한다. 이 저장소에는 아직 실제 모델이 없으므로
// (가이드 9장 G3/G4), 모델을 실제로 돌리는 경로가 아니라 "이미 계산된 예측 결과 CSV를 올려
// 지표 계산 파이프라인만 검증하는" 경로로 확인한다 — 목 예측은 여기서만 쓰이고, 실제 서비스
// 분석 코드(src/lib/poster/analyze.ts)에는 전혀 들어가지 않는다.

const PREDICTIONS_CSV = [
  "id,true_label,predicted_label,top_score,margin,split,org_name",
  "1,IT_DATA,IT_DATA,0.9,0.8,test,A재단",
  "2,IT_DATA,DESIGN_MEDIA,0.6,0.1,test,A재단",
  "3,DESIGN_MEDIA,DESIGN_MEDIA,0.85,0.3,test,B재단",
  "4,DESIGN_MEDIA,DESIGN_MEDIA,0.95,0.5,test,B재단",
  "5,IT_DATA,IT_DATA,0.9,0.8,ood,C재단",
].join("\n");

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("학교 이메일").fill(email);
  await page.getByRole("button", { name: "매직링크 보내기" }).click();
  await expect(page.getByText(`${email}로 로그인 링크를 보냈어요.`)).toBeVisible();
  const magicLink = await fetchLatestMagicLink(email);
  await page.goto(magicLink);
}

test("모델 평가 화면이 예측 결과 CSV(목 예측)로 정확도·macro-F1·ood 수락률을 계산해 보여준다", async ({ page }) => {
  await loginAs(page, TEST_USERS.admin.email);
  await page.goto("/admin/model-lab");

  await expect(page.getByRole("heading", { name: "6.3 모델 평가" })).toBeVisible();
  await page
    .getByLabel("예측 결과 CSV (id,true_label,predicted_label,top_score,margin,split,org_name)")
    .setInputFiles({ name: "predictions.csv", mimeType: "text/csv", buffer: Buffer.from(PREDICTIONS_CSV, "utf-8") });

  await expect(page.getByText("5건 로드됨 (test 4건)")).toBeVisible();
  await expect(page.getByText("정확도: 3/4 (75%)")).toBeVisible();
  await expect(page.getByText(/다수 클래스 기준선:/)).toBeVisible();
  await expect(page.getByText(/macro-F1:/)).toBeVisible();
  await expect(page.getByText("ood 중 suggested 비율: 1/1 (100%)")).toBeVisible();

  // 분야별 표에 IT_DATA/DESIGN_MEDIA 행이 보인다.
  await expect(page.getByRole("cell", { name: "IT_DATA", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "DESIGN_MEDIA", exact: true })).toBeVisible();

  // JSON/마크다운 다운로드 버튼이 실제로 다운로드를 발생시킨다(내용 검증은 단위 테스트가 한다).
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "JSON 다운로드" }).click()]);
  expect(download.suggestedFilename()).toBe("model-evaluation.json");
});
