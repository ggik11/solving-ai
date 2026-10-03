import { test, expect, type Page } from "@playwright/test";
import { fetchLatestMagicLink } from "./mailpit";
import { createAdminClient, TEST_USERS } from "../rls/helpers";

const LEADER_EMAIL = TEST_USERS.student1.email; // 신고 대상
const REPORTER_EMAIL = TEST_USERS.student2.email;
const ADMIN_EMAIL = TEST_USERS.admin.email;

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("학교 이메일").fill(email);
  await page.getByRole("button", { name: "매직링크 보내기" }).click();
  await expect(page.getByText(`${email}로 로그인 링크를 보냈어요.`)).toBeVisible();

  const magicLink = await fetchLatestMagicLink(email);
  await page.goto(magicLink);
}

test("신고 → 관리자 처리 → 감사 로그 기록", async ({ browser }) => {
  const admin = createAdminClient();
  const activityTitle = `E2E 신고 테스트 활동 ${Date.now()}`;
  const partyTitle = `E2E 신고 테스트 파티 ${Date.now()}`;

  const { data: activity, error: activityError } = await admin
    .from("activities")
    .insert({ title: activityTitle, status: "published", participation_mode: "team", location_type: "offline", is_demo: true })
    .select("id")
    .single();
  if (activityError || !activity) throw new Error(`테스트 활동 생성 실패: ${activityError?.message}`);

  // 파티/멤버는 admin 클라이언트로 직접 구성한다(chat-flow.spec.ts와 같은 이유 — UI 매직링크
  // 로그인과 signInAs()를 같은 이메일로 함께 쓰면 로컬 auth rate limit에 걸린다).
  const { data: party, error: partyError } = await admin
    .from("parties")
    .insert({
      activity_id: activity.id, source: "manual", leader_id: TEST_USERS.student1.id,
      title: partyTitle, capacity: 2, meeting_mode: "offline", status: "recruiting",
    })
    .select("id")
    .single();
  if (partyError || !party) throw new Error(`파티 생성 실패: ${partyError?.message}`);
  const partyId = party.id as string;

  const { data: slot, error: slotError } = await admin
    .from("party_role_slots")
    .insert({ party_id: partyId, role_name: "팀원", capacity: 2 })
    .select("id")
    .single();
  if (slotError || !slot) throw new Error(`역할 슬롯 생성 실패: ${slotError?.message}`);

  const { error: membersError } = await admin.from("party_members").insert([
    { party_id: partyId, profile_id: TEST_USERS.student1.id, role_slot_id: slot.id, is_leader: true, status: "active" },
    { party_id: partyId, profile_id: TEST_USERS.student2.id, role_slot_id: slot.id, is_leader: false, status: "active" },
  ]);
  if (membersError) throw new Error(`멤버 생성 실패: ${membersError.message}`);

  try {
    // 1. student2가 파티 멤버 목록에서 student1(팀장)을 신고한다.
    const reporterContext = await browser.newContext();
    const reporterPage = await reporterContext.newPage();
    await loginAs(reporterPage, REPORTER_EMAIL);

    await reporterPage.goto(`/parties/${partyId}`);
    await reporterPage.getByRole("button", { name: "신고", exact: true }).click();
    await reporterPage.getByLabel("신고 사유").selectOption("harassment");
    await reporterPage.getByPlaceholder("자세한 설명 (선택)").fill("E2E 테스트 신고입니다.");
    await reporterPage.getByRole("button", { name: "신고 제출" }).click();
    await expect(reporterPage.getByText("신고가 접수되었어요.")).toBeVisible();
    await reporterContext.close();

    // 2. 운영자가 /admin/reports에서 신고를 확인하고 상태를 "조치"로 바꾼다.
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await loginAs(adminPage, ADMIN_EMAIL);

    await adminPage.goto("/admin/reports");
    const reportRow = adminPage.locator("li").filter({ hasText: "E2E 테스트 신고입니다." });
    await expect(reportRow).toBeVisible();
    await reportRow.getByRole("button", { name: "조치로 변경" }).click();
    await expect(reportRow.getByText("조치")).toBeVisible();

    // 3. 처리 결과가 감사 로그에 남는다.
    await adminPage.goto("/admin/audit-logs");
    await expect(adminPage.getByText("신고 상태 변경").first()).toBeVisible();
    await adminContext.close();

    const { data: report } = await admin
      .from("reports")
      .select("id, status")
      .eq("target_id", TEST_USERS.student1.id)
      .eq("target_type", "profile")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(report!.status).toBe("resolved");

    const { data: logs } = await admin
      .from("audit_logs")
      .select("id")
      .eq("action", "report_status_changed")
      .eq("target_id", report!.id);
    expect(logs ?? []).toHaveLength(1);
  } finally {
    await admin.from("reports").delete().eq("target_id", TEST_USERS.student1.id).eq("target_type", "profile");
    await admin.from("activities").delete().eq("id", activity.id);
  }
});
