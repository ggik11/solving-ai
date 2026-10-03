import { describe, expect, it } from "vitest";
import { createAnonClient, createAdminClient, TEST_USERS } from "./helpers";

// "비로그인 사용자" 시나리오: 공개 데이터는 읽을 수 있지만, 그 외 사용자 데이터는 전부 거부되어야 한다.
describe("비로그인(anon) 사용자", () => {
  it("공개(published) 활동은 조회할 수 있다", async () => {
    const anon = createAnonClient();
    const { data, error } = await anon
      .from("activities")
      .select("id, status")
      .eq("status", "published")
      .limit(1);
    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThan(0);
  });

  it("draft/closed 활동은 비회원에게 보이지 않는다", async () => {
    const anon = createAnonClient();
    const { data, error } = await anon.from("activities").select("id").eq("status", "closed");
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(0);
  });

  it("활동을 새로 등록하려는 쓰기는 거부된다", async () => {
    const anon = createAnonClient();
    const { error } = await anon.from("activities").insert({
      title: "비회원이 올린 활동",
      status: "published",
    });
    expect(error).not.toBeNull();
  });

  it("다른 사용자의 프로필(비공개 설정)을 읽을 수 없다", async () => {
    const admin = createAdminClient();
    await admin
      .from("profiles")
      .update({ profile_visibility: "private" })
      .eq("id", TEST_USERS.student1.id);

    const anon = createAnonClient();
    const { data, error } = await anon.from("profiles").select("id").eq("id", TEST_USERS.student1.id);
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(0);

    await admin
      .from("profiles")
      .update({ profile_visibility: "members_only" })
      .eq("id", TEST_USERS.student1.id);
  });

  it("알림/채팅 같은 사용자 데이터는 전혀 조회할 수 없다", async () => {
    const anon = createAnonClient();
    const notifications = await anon.from("notifications").select("id");
    expect(notifications.data?.length ?? 0).toBe(0);

    const chatMessages = await anon.from("chat_messages").select("id");
    expect(chatMessages.data?.length ?? 0).toBe(0);
  });
});
