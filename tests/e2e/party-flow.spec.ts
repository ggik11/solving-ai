import { test, expect, type Page } from "@playwright/test";
import { fetchLatestMagicLink } from "./mailpit";
import { createAdminClient } from "../rls/helpers";

const LEADER_EMAIL = "student1@smu.ac.kr"; // supabase/seed.sql 테스트 계정, 온보딩 완료 상태
const APPLICANT_EMAIL = "student2@smu.ac.kr";

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("학교 이메일").fill(email);
  await page.getByRole("button", { name: "매직링크 보내기" }).click();
  await expect(page.getByText(`${email}로 로그인 링크를 보냈어요.`)).toBeVisible();

  const magicLink = await fetchLatestMagicLink(email);
  await page.goto(magicLink);
}

test("student1 파티 생성 → student2 지원 → 승인 → 양쪽 '내 파티'에 반영된다", async ({ browser }) => {
  const admin = createAdminClient();
  const partyTitle = `E2E 테스트 파티 ${Date.now()}`;

  const { data: activity, error } = await admin
    .from("activities")
    .insert({
      title: `E2E 파티 테스트 활동 ${Date.now()}`,
      status: "published",
      participation_mode: "team",
      location_type: "offline",
      is_demo: true,
    })
    .select("id")
    .single();
  if (error || !activity) {
    throw new Error(`테스트 활동 생성 실패: ${error?.message}`);
  }

  try {
    // 1. student1(팀장) 로그인 → 파티 생성
    const leaderContext = await browser.newContext();
    const leaderPage = await leaderContext.newPage();
    await loginAs(leaderPage, LEADER_EMAIL);

    await leaderPage.goto(`/parties/new?activity=${activity.id}`);
    await leaderPage.getByLabel("파티 이름").fill(partyTitle);
    // 기본 역할 입력 행 1개(기획, 정원 1)에 이어 역할을 하나 더 추가(개발, 정원 2).
    await leaderPage.getByPlaceholder("역할 (예: 기획, 개발, 디자인)").first().fill("기획");
    await leaderPage.getByRole("button", { name: "역할 추가" }).click();
    const roleNameInputs = leaderPage.getByPlaceholder("역할 (예: 기획, 개발, 디자인)");
    await roleNameInputs.nth(1).fill("개발");
    await leaderPage.getByLabel("개발 인원").fill("2");
    await leaderPage.getByLabel("팀장이 맡을 역할 *").selectOption("기획");
    await leaderPage.getByRole("button", { name: "파티 만들기" }).click();
    await expect(leaderPage).toHaveURL(/\/parties\/[0-9a-f-]+$/);
    const partyUrl = leaderPage.url();

    await leaderPage.goto("/parties");
    await expect(leaderPage.getByText(partyTitle)).toBeVisible();

    // 2. student2(지원자) 로그인 → 해당 파티에 지원
    const applicantContext = await browser.newContext();
    const applicantPage = await applicantContext.newPage();
    await loginAs(applicantPage, APPLICANT_EMAIL);

    await applicantPage.goto(partyUrl);
    await applicantPage.getByRole("button", { name: "이 파티에 지원하기" }).click();
    await applicantPage.getByLabel("지원할 역할").selectOption({ label: "개발" });
    await applicantPage.getByRole("button", { name: "지원하기" }).click();
    await expect(applicantPage.getByRole("button", { name: "지원 취소" })).toBeVisible();

    await applicantPage.goto("/parties");
    const pendingRow = applicantPage.getByRole("link", { name: new RegExp(partyTitle) });
    await expect(pendingRow).toBeVisible();
    await expect(pendingRow.getByText("응답 대기")).toBeVisible();

    // 3. student1이 지원을 승인
    await leaderPage.goto(partyUrl);
    await leaderPage.getByRole("button", { name: "승인" }).click();
    await expect(leaderPage.getByText("대기 중인 지원이 없어요")).toBeVisible();
    await expect(leaderPage.getByText("2 / 3명")).toBeVisible();

    // 4. student2의 "내 파티"에 참여 중인 파티로 표시되고, 더 이상 "응답 대기"가 아니다.
    await applicantPage.goto("/parties");
    const joinedRow = applicantPage.getByRole("link", { name: new RegExp(partyTitle) });
    await expect(joinedRow).toBeVisible();
    await expect(joinedRow.getByText("응답 대기")).not.toBeVisible();

    await leaderContext.close();
    await applicantContext.close();
  } finally {
    await admin.from("activities").delete().eq("id", activity.id);
  }
});
