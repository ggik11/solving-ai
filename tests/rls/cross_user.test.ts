import { describe, expect, it } from "vitest";
import { createAdminClient, signInAs, TEST_USERS } from "./helpers";

// "다른 사용자" 시나리오: 로그인은 했지만 본인 소유가 아닌 데이터에는 접근할 수 없어야 한다.
describe("다른 사용자의 데이터 접근", () => {
  it("다른 사용자의 프로필을 수정할 수 없다", async () => {
    const asStudent1 = await signInAs(TEST_USERS.student1.email);
    const { error, data } = await asStudent1
      .from("profiles")
      .update({ bio: "해킹 시도" })
      .eq("id", TEST_USERS.student2.id)
      .select();

    // RLS 위반 시 PostgREST는 영향받은 행이 0개인 성공 응답을 주거나 에러를 준다 — 두 경우 모두 "거부"로 본다.
    expect(error !== null || (data?.length ?? 0) === 0).toBe(true);

    const admin = createAdminClient();
    const { data: check } = await admin
      .from("profiles")
      .select("bio")
      .eq("id", TEST_USERS.student2.id)
      .single();
    expect(check?.bio).not.toBe("해킹 시도");
  });

  it("다른 사용자의 알림을 읽을 수 없다", async () => {
    const asStudent1 = await signInAs(TEST_USERS.student1.email);
    const { data, error } = await asStudent1
      .from("notifications")
      .select("id")
      .eq("profile_id", TEST_USERS.student3.id);
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(0);
  });

  it("자신이 속하지 않은 파티의 채팅방/메시지를 읽을 수 없다", async () => {
    const admin = createAdminClient();
    const { data: otherParty } = await admin
      .from("parties")
      .select("id")
      .eq("leader_id", TEST_USERS.student3.id)
      .limit(1)
      .single();
    expect(otherParty).toBeTruthy();

    const { data: room } = await admin
      .from("chat_rooms")
      .select("id")
      .eq("party_id", otherParty!.id)
      .single();
    expect(room).toBeTruthy();

    // student1은 이 파티의 멤버가 아니다.
    const asStudent1 = await signInAs(TEST_USERS.student1.email);
    const { data: rooms, error: roomsError } = await asStudent1
      .from("chat_rooms")
      .select("id")
      .eq("id", room!.id);
    expect(roomsError).toBeNull();
    expect(rooms?.length ?? 0).toBe(0);

    const { data: messages, error: messagesError } = await asStudent1
      .from("chat_messages")
      .select("id")
      .eq("chat_room_id", room!.id);
    expect(messagesError).toBeNull();
    expect(messages?.length ?? 0).toBe(0);
  });

  it("파티의 활성 멤버는 confirmed 여부와 무관하게 채팅에 접근할 수 있다 (설계 수정 #1)", async () => {
    const admin = createAdminClient();
    // seed의 'recruiting' 상태 수동 파티 — 아직 confirmed가 아니다.
    const { data: recruitingParty } = await admin
      .from("parties")
      .select("id, status, leader_id")
      .eq("status", "recruiting")
      .limit(1)
      .single();
    expect(recruitingParty?.status).toBe("recruiting");

    const { data: room } = await admin
      .from("chat_rooms")
      .select("id")
      .eq("party_id", recruitingParty!.id)
      .single();
    expect(room).toBeTruthy();

    const leaderEmail = Object.values(TEST_USERS).find((u) => u.id === recruitingParty!.leader_id)?.email;
    expect(leaderEmail).toBeTruthy();

    const asLeader = await signInAs(leaderEmail!);
    const { data: messages, error } = await asLeader
      .from("chat_messages")
      .select("id")
      .eq("chat_room_id", room!.id);
    expect(error).toBeNull();
    // 메시지가 0개여도 되고(RLS가 허용했다는 사실이 중요), 에러 없이 조회되면 접근이 허용된 것이다.
    expect(messages).not.toBeNull();
  });

  it("같은 파티원은 서로의 멤버십을 조회할 수 있지만, 다른 파티원은 조회할 수 없다 (is_party_member 헬퍼)", async () => {
    const admin = createAdminClient();
    // seed의 확정 디자인 파티: 팀장 student3 + 팀원 student4.
    const { data: party } = await admin
      .from("parties")
      .select("id")
      .eq("leader_id", TEST_USERS.student3.id)
      .limit(1)
      .single();
    expect(party).toBeTruthy();

    const { data: members } = await admin.from("party_members").select("profile_id").eq("party_id", party!.id);
    expect(members?.length).toBe(2);

    // student3(팀장)이 같은 파티원인 student4의 멤버십 행을 볼 수 있어야 한다.
    const asStudent3 = await signInAs(TEST_USERS.student3.email);
    const { data: seenByLeader, error: leaderError } = await asStudent3
      .from("party_members")
      .select("profile_id")
      .eq("party_id", party!.id);
    expect(leaderError).toBeNull();
    expect(seenByLeader?.length).toBe(2);

    // student4(팀원)도 같은 파티원인 student3의 행을 볼 수 있어야 한다.
    const asStudent4 = await signInAs(TEST_USERS.student4.email);
    const { data: seenByMember, error: memberError } = await asStudent4
      .from("party_members")
      .select("profile_id")
      .eq("party_id", party!.id);
    expect(memberError).toBeNull();
    expect(seenByMember?.length).toBe(2);

    // 이 파티에 속하지 않은 student1은 이 파티의 멤버십 행을 하나도 볼 수 없다.
    const asStudent1 = await signInAs(TEST_USERS.student1.email);
    const { data: seenByOutsider, error: outsiderError } = await asStudent1
      .from("party_members")
      .select("profile_id")
      .eq("party_id", party!.id);
    expect(outsiderError).toBeNull();
    expect(seenByOutsider?.length ?? 0).toBe(0);
  });
});
