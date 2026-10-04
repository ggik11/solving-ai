import { test, expect, type Page } from "@playwright/test";
import { fetchLatestMagicLink } from "./mailpit";
import { createAdminClient, TEST_USERS } from "../rls/helpers";

// 지시서 13장 "채팅 접근 공격 — 다른 팀의 조회·전송·구독 요청이 서버/DB에서 거부됨"을, "애초에
// 그 팀의 멤버였던 적이 없는 사용자"의 관점에서 확인한다(chat-flow.spec.ts는 "이미 구독 중이던
// 연결"이 탈퇴 직후 거부되는, 더 어려운 케이스를 확인한다 — 이 테스트는 그 반대쪽을 보강).
// tests/rls/chat.test.ts가 REST 레벨 조회·전송 거부를 이미 확인했으므로, 여기서는 실제 브라우저로
// "페이지 접근 자체가 막혀 구독 시도조차 일어나지 않는다"는 것과, 혹시 URL로 직접 roomId를
// 조작해도 메시지 입력창이 뜨지 않는다는 것을 확인한다.

const OUTSIDER_EMAIL = TEST_USERS.student4.email; // 파티에 전혀 속하지 않은 제3자 역할

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("학교 이메일").fill(email);
  await page.getByRole("button", { name: "매직링크 보내기" }).click();
  await expect(page.getByText(`${email}로 로그인 링크를 보냈어요.`)).toBeVisible();

  const magicLink = await fetchLatestMagicLink(email);
  await page.goto(magicLink);
}

test("파티 멤버였던 적이 없는 사용자는 그 채팅방에 전혀 접근할 수 없다", async ({ browser }) => {
  const admin = createAdminClient();
  const activityTitle = `E2E 아웃사이더 테스트 활동 ${Date.now()}`;
  const partyTitle = `E2E 아웃사이더 테스트 파티 ${Date.now()}`;

  const { data: activity, error: activityError } = await admin
    .from("activities")
    .insert({ title: activityTitle, status: "published", participation_mode: "team", location_type: "offline", is_demo: true })
    .select("id")
    .single();
  if (activityError || !activity) throw new Error(`테스트 활동 생성 실패: ${activityError?.message}`);

  // student1/student2만 멤버인 파티 + 채팅방을 만든다. student4(outsider)는 전혀 등장하지 않는다.
  const { data: party, error: partyError } = await admin
    .from("parties")
    .insert({
      activity_id: activity.id, source: "manual", leader_id: TEST_USERS.student1.id,
      title: partyTitle, capacity: 2, meeting_mode: "offline", status: "recruiting",
    })
    .select("id")
    .single();
  if (partyError || !party) throw new Error(`파티 생성 실패: ${partyError?.message}`);

  const { data: slot, error: slotError } = await admin
    .from("party_role_slots")
    .insert({ party_id: party.id, role_name: "팀원", capacity: 2 })
    .select("id")
    .single();
  if (slotError || !slot) throw new Error(`역할 슬롯 생성 실패: ${slotError?.message}`);

  await admin.from("party_members").insert([
    { party_id: party.id, profile_id: TEST_USERS.student1.id, role_slot_id: slot.id, is_leader: true, status: "active" },
    { party_id: party.id, profile_id: TEST_USERS.student2.id, role_slot_id: slot.id, is_leader: false, status: "active" },
  ]);

  const { data: room } = await admin.from("chat_rooms").select("id").eq("party_id", party.id).single();
  const roomId = room!.id as string;

  try {
    const outsiderContext = await browser.newContext();
    const outsiderPage = await outsiderContext.newPage();
    await loginAs(outsiderPage, OUTSIDER_EMAIL);

    // 1. roomId를 직접 알아내 URL로 접근해도(링크를 공유받았다고 가정) 페이지 자체가 막힌다 —
    //    서버 컴포넌트가 멤버십을 재확인해 notFound()로 처리하므로 메시지 입력창이 없다.
    await outsiderPage.goto(`/chat/${roomId}`);
    await expect(outsiderPage.getByLabel("메시지 입력")).not.toBeVisible();
    await expect(outsiderPage.getByText(partyTitle)).not.toBeVisible();

    // 2. 채팅 목록에도 이 방이 뜨지 않는다(list_my_chat_rooms가 본인이 속한 방만 반환).
    await outsiderPage.goto("/chat");
    await expect(outsiderPage.getByText(partyTitle)).not.toBeVisible();

    await outsiderContext.close();
  } finally {
    await admin.from("activities").delete().eq("id", activity.id);
  }
});
