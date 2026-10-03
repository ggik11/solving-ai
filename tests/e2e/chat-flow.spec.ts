import { test, expect, type Page } from "@playwright/test";
import { fetchLatestMagicLink } from "./mailpit";
import { createAdminClient, TEST_USERS } from "../rls/helpers";

const LEADER_EMAIL = TEST_USERS.student1.email;
const MEMBER_EMAIL = TEST_USERS.student2.email;

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("학교 이메일").fill(email);
  await page.getByRole("button", { name: "매직링크 보내기" }).click();
  await expect(page.getByText(`${email}로 로그인 링크를 보냈어요.`)).toBeVisible();

  const magicLink = await fetchLatestMagicLink(email);
  await page.goto(magicLink);
}

async function sendMessage(page: Page, text: string) {
  await page.getByLabel("메시지 입력").fill(text);
  await page.getByRole("button", { name: "전송" }).click();
}

test("student1과 student2가 팀 채팅으로 실시간 소통하고, 새로고침·탈퇴 이후에도 규칙이 지켜진다", async ({ browser }) => {
  const admin = createAdminClient();
  const activityTitle = `E2E 채팅 테스트 활동 ${Date.now()}`;
  const partyTitle = `E2E 채팅 테스트 파티 ${Date.now()}`;

  const { data: activity, error: activityError } = await admin
    .from("activities")
    .insert({ title: activityTitle, status: "published", participation_mode: "team", location_type: "offline", is_demo: true })
    .select("id")
    .single();
  if (activityError || !activity) throw new Error(`테스트 활동 생성 실패: ${activityError?.message}`);

  // 파티/멤버는 admin 클라이언트로 직접 구성한다(파티 가입 플로우 자체는 party-flow.spec.ts가 이미
  // 검증함). signInAs()의 admin.generateLink()를 쓰지 않는 이유: 같은 이메일로 곧바로 UI 매직링크
  // 로그인(signInWithOtp)까지 호출하면 로컬 auth rate limit("0초 후에 다시 요청 가능")에 걸린다.
  const { data: party, error: partyError } = await admin
    .from("parties")
    .insert({
      activity_id: activity.id,
      source: "manual",
      leader_id: TEST_USERS.student1.id,
      title: partyTitle,
      capacity: 2,
      meeting_mode: "offline",
      status: "recruiting",
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

  const { data: room } = await admin.from("chat_rooms").select("id").eq("party_id", partyId).single();
  const roomId = room!.id as string;

  try {
    const leaderContext = await browser.newContext();
    const leaderPage = await leaderContext.newPage();
    await loginAs(leaderPage, LEADER_EMAIL);

    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    await loginAs(memberPage, MEMBER_EMAIL);

    // 1. 둘 다 같은 채팅방을 연다.
    await leaderPage.goto(`/chat/${roomId}`);
    await expect(leaderPage.getByText("팀을 나가도 과거 채팅 내역은 팀에 남아요.")).toBeVisible();
    await memberPage.goto(`/chat/${roomId}`);

    // 2. leader가 보낸 메시지를 member가 실시간으로 받는다.
    const greeting = `안녕하세요 리더입니다 ${Date.now()}`;
    await sendMessage(leaderPage, greeting);
    await expect(memberPage.getByText(greeting)).toBeVisible({ timeout: 10_000 });

    // 3. member가 보낸 메시지를 leader가 실시간으로 받는다.
    const reply = `반갑습니다 멤버입니다 ${Date.now()}`;
    await sendMessage(memberPage, reply);
    await expect(leaderPage.getByText(reply)).toBeVisible({ timeout: 10_000 });

    // 4. 새로고침 후에도 내역이 복구된다(DB 영구 저장).
    await leaderPage.reload();
    await expect(leaderPage.getByText(greeting)).toBeVisible();
    await expect(leaderPage.getByText(reply)).toBeVisible();

    // 5. leader가 방을 떠난 뒤(목록으로 이동) member가 새 메시지를 보내면 안 읽은 수가 올라간다.
    await leaderPage.goto("/chat");
    const secondReply = `아직 안 읽은 메시지입니다 ${Date.now()}`;
    await sendMessage(memberPage, secondReply);
    await leaderPage.reload();
    const roomRow = leaderPage.getByRole("link", { name: new RegExp(partyTitle) });
    await expect(roomRow).toBeVisible();
    await expect(roomRow.getByLabel(/안 읽은 메시지/)).toBeVisible();

    // 6. 방에 다시 들어가 읽으면 목록에서 안 읽은 배지가 사라진다. 메시지 본문이 보이는 것은
    // 클라이언트의 실시간 따라잡기(catch-up) 경로로도 채워질 수 있어 "서버가 읽음 처리를 커밋
    // 완료했다"는 보장이 되지 않으므로, 다음 요청 전에 네트워크가 가라앉기를 기다린다.
    await roomRow.click();
    await expect(leaderPage.getByText(secondReply)).toBeVisible();
    await leaderPage.waitForLoadState("networkidle");
    await leaderPage.goto("/chat");
    await expect(leaderPage.getByRole("link", { name: new RegExp(partyTitle) }).getByLabel(/안 읽은 메시지/)).not.toBeVisible();

    // 7. member가 파티에서 탈퇴하면(DB 직접 반영) 더 이상 이 채팅방에 접근할 수 없다.
    await admin.from("party_members").update({ status: "left" }).eq("party_id", partyId).eq("profile_id", TEST_USERS.student2.id);

    await leaderPage.goto(`/chat/${roomId}`);
    const afterLeaveMessage = `탈퇴 후 메시지 ${Date.now()}`;
    await sendMessage(leaderPage, afterLeaveMessage);
    // 이미 열려 있던 memberPage는 탈퇴 후 새 메시지를 받지 못해야 한다(하트비트가 멤버십을 재확인해 구독을 끊음).
    await expect(memberPage.getByText(afterLeaveMessage)).not.toBeVisible({ timeout: 8_000 });

    // 다시 방문(새로고침)하면 서버에서도 명확히 거부된다 — 메시지 입력창이 보이지 않는다.
    await memberPage.reload();
    await expect(memberPage.getByLabel("메시지 입력")).not.toBeVisible();

    await leaderContext.close();
    await memberContext.close();
  } finally {
    await admin.from("activities").delete().eq("id", activity.id);
  }
});
