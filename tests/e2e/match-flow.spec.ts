import { test, expect, type Page } from "@playwright/test";
import { fetchLatestMagicLink } from "./mailpit";
import { createAdminClient, TEST_USERS } from "../rls/helpers";

const LEADER_EMAIL = TEST_USERS.student1.email; // 기획러민지 — UI로 직접 참가
const WAITING_EMAIL = TEST_USERS.student2.email; // 개발자준호 — 미리 "개발" 역할로 대기 중으로 세팅

// student1은 월요일 09-12, student2는 월요일 10-12에 가능하다(supabase/seed.sql 1절) — 교집합
// 10-12(120분)로 기본 설정(60분) 이상이라 워커가 즉시 매칭을 편성한다.
async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("학교 이메일").fill(email);
  await page.getByRole("button", { name: "매직링크 보내기" }).click();
  await expect(page.getByText(`${email}로 로그인 링크를 보냈어요.`)).toBeVisible();

  const magicLink = await fetchLatestMagicLink(email);
  await page.goto(magicLink);
}

test("빠른 매칭 전체 흐름: 대기열 참가 → 워커 실행 → 제안 → 전원 수락 → 채팅", async ({ browser }) => {
  const admin = createAdminClient();

  const { data: activity, error: activityError } = await admin
    .from("activities")
    .insert({
      title: `E2E 매칭 테스트 활동 ${Date.now()}`,
      status: "published",
      participation_mode: "team",
      location_type: "offline",
      is_demo: true,
    })
    .select("id")
    .single();
  if (activityError || !activity) throw new Error(`테스트 활동 생성 실패: ${activityError?.message}`);

  const { data: template, error: templateError } = await admin
    .from("activity_match_templates")
    .insert({ activity_id: activity.id, name: "2인: 기획+개발" })
    .select("id")
    .single();
  if (templateError || !template) throw new Error(`템플릿 생성 실패: ${templateError?.message}`);

  await admin.from("activity_match_template_roles").insert([
    { template_id: template.id, role_name: "기획", capacity: 1 },
    { template_id: template.id, role_name: "개발", capacity: 1 },
  ]);

  // student2는 이미 "개발" 역할로 대기 중이라고 미리 세팅한다(지시서: 역할·시간이 맞는 사람이
  // 이미 대기 중인 상태에서 테스트 사용자가 참가하면 바로 제안이 생기는 시나리오).
  const { error: queueError } = await admin.from("matching_queue").insert({
    activity_id: activity.id,
    profile_id: TEST_USERS.student2.id,
    template_id: template.id,
    eligible_roles: ["개발"],
    willing_leader: false,
    continue_on_fail: true,
    status: "waiting",
  });
  if (queueError) throw new Error(`대기열 세팅 실패: ${queueError.message}`);

  const leaderContext = await browser.newContext();
  const leaderPage = await leaderContext.newPage();
  leaderPage.on("dialog", (d) => d.accept());
  await loginAs(leaderPage, LEADER_EMAIL);

  const waitingContext = await browser.newContext();
  const waitingPage = await waitingContext.newPage();
  waitingPage.on("dialog", (d) => d.accept());
  await loginAs(waitingPage, WAITING_EMAIL);

  try {
    // 1. student1이 /match에서 "기획" 역할로 빠른 매칭에 참가한다.
    await leaderPage.goto(`/match/${activity.id}`);
    await leaderPage.getByRole("checkbox", { name: "기획" }).check();
    await leaderPage.getByLabel("팀장을 맡을 수 있어요").check();
    await leaderPage.getByLabel("빠른 매칭 참여에 동의합니다 *").check();
    await leaderPage.getByRole("button", { name: "빠른 매칭 참가하기" }).click();
    await expect(leaderPage.getByText("매칭 대기 중이에요")).toBeVisible();

    // 2. 워커를 실행한다(실제 운영에서는 pg_cron이 매분 수행 — 테스트는 즉시 실행해 확인한다).
    const { error: workerError } = await admin.rpc("run_match_worker", { p_as_of: new Date().toISOString() });
    expect(workerError).toBeNull();

    // 3. 두 사람 모두 새로고침하면 제안 화면이 뜬다.
    await leaderPage.reload();
    await expect(leaderPage.getByText("팀 제안이 도착했어요")).toBeVisible();
    await expect(leaderPage.getByText("개발자준호")).toBeVisible();

    await waitingPage.goto(`/match/${activity.id}`);
    await expect(waitingPage.getByText("팀 제안이 도착했어요")).toBeVisible();
    await expect(waitingPage.getByText("기획러민지")).toBeVisible();

    // 4. 전원 수락 → 파티+채팅방이 생성된다.
    await leaderPage.getByRole("button", { name: "수락" }).click();
    await expect(leaderPage.getByText("이미 수락했어요")).toBeVisible();

    await waitingPage.getByRole("button", { name: "수락" }).click();

    // 5. 이 활동으로 생성된 채팅방(파티 이름이 고유하지 않을 수 있어 activity_id로 특정한다)에서
    // 실제로 대화할 수 있는지 확인한다.
    await expect
      .poll(async () => {
        const { data } = await admin.from("parties").select("id").eq("activity_id", activity.id).eq("source", "matching").maybeSingle();
        return data?.id ?? null;
      })
      .not.toBeNull();
    const { data: party } = await admin.from("parties").select("id").eq("activity_id", activity.id).eq("source", "matching").single();
    const { data: room } = await admin.from("chat_rooms").select("id").eq("party_id", party!.id).single();
    const roomUrl = `/chat/${room!.id}`;

    await leaderPage.goto(roomUrl);
    await expect(leaderPage.getByText("빠른 매칭으로 팀이 확정되었어요")).toBeVisible();

    const greeting = `매칭 테스트 인사 ${Date.now()}`;
    await leaderPage.getByLabel("메시지 입력").fill(greeting);
    await leaderPage.getByRole("button", { name: "전송" }).click();

    await waitingPage.goto(roomUrl);
    await expect(waitingPage.getByText(greeting)).toBeVisible({ timeout: 10_000 });
  } finally {
    await leaderContext.close();
    await waitingContext.close();
    await admin.from("activities").delete().eq("id", activity.id);
  }
});
