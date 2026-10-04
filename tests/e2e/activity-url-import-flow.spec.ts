import { test, expect, type Page } from "@playwright/test";
import { fetchLatestMagicLink } from "./mailpit";
import { createAdminClient, TEST_USERS } from "../rls/helpers";
import { FixtureServer } from "./fixture-server";

const ADMIN_EMAIL = TEST_USERS.admin.email;

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("학교 이메일").fill(email);
  await page.getByRole("button", { name: "매직링크 보내기" }).click();
  await expect(page.getByText(`${email}로 로그인 링크를 보냈어요.`)).toBeVisible();

  const magicLink = await fetchLatestMagicLink(email);
  await page.goto(magicLink);
}

function formatKstDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}.`;
}

test("관리자가 URL을 붙여넣음 → 미리보기 → 수정 → 승인 → 활동 목록에 표시", async ({ page }) => {
  const title = `E2E URL 가져오기 공모전 ${Date.now()}`;
  const applyEnd = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
  const applyEndRaw = `${formatKstDate(applyEnd)} 18:00`;

  const server = new FixtureServer({
    "/notice": `<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8">
<title>${title} - E2E가상기관</title>
<meta name="description" content="E2E 테스트용 가상 공모전입니다.">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Event","name":"${title}","organizer":{"@type":"Organization","name":"E2E가상기관"}}
</script>
</head><body>
<p>접수 마감: ${applyEndRaw}까지 제출해야 합니다.</p>
</body></html>`,
  });
  const noticeUrl = await server.url("/notice");

  try {
    await loginAs(page, ADMIN_EMAIL);
    await page.goto("/admin/activities/new");

    await page.getByPlaceholder("https://notice.example.org/...").fill(noticeUrl);
    await page.getByRole("button", { name: "URL로 가져오기" }).click();

    await expect(page.getByText(`제목: ${title}`).first()).toBeVisible();
    await expect(page.getByText("주최기관: E2E가상기관").first()).toBeVisible();

    await page.getByRole("button", { name: "적용", exact: true }).first().click(); // 제목 적용
    await expect(page.getByLabel("제목 *")).toHaveValue(title);

    // 접수 마감 날짜 후보를 찾아 적용한다(근거 문장이 함께 보여야 한다).
    await expect(page.getByText(applyEndRaw, { exact: false }).first()).toBeVisible();
    await page.getByRole("button", { name: "이 값으로 적용" }).first().click();
    const applyEndInput = page.getByLabel("접수 마감");
    await expect(applyEndInput).not.toHaveValue("");
    await expect(page.getByText("원문에서 확인됨", { exact: false }).last()).toBeVisible();

    // 미리보기 값을 그대로 쓰지 않고 운영자가 "수정"했다는 것을 보여주기 위해 요약을 직접 입력.
    await page.getByLabel("한 줄 요약").fill("운영자가 직접 다듬은 한 줄 요약입니다.");

    // 운영자가 검토 후 즉시 공개 상태로 등록(= 승인).
    await page.getByLabel("공개 상태").selectOption("published");
    await page.getByRole("button", { name: "등록" }).click();

    await expect(page).toHaveURL(/\/admin\/activities$/);
    await expect(page.getByText(title)).toBeVisible();

    // 활동 목록(공개 화면)에도 표시되는지 확인한다.
    await page.goto("/activities");
    await page.getByPlaceholder("키워드 (제목·주최기관)").fill(title);
    await page.getByRole("button", { name: "검색" }).click();
    await expect(page.getByText(title).first()).toBeVisible();
  } finally {
    await server.close();
    const admin = createAdminClient();
    await admin.from("activities").delete().eq("title", title);
  }
});
