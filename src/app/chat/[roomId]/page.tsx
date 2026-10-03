import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/auth";
import { PageContainer } from "@/components/PageContainer";
import { BlockToggleButton } from "@/components/BlockToggleButton";
import { ReportButton } from "@/components/ReportButton";
import { blockedCounterpartIds, type BlockRow } from "@/lib/blocks";
import type { ChatMessage } from "@/lib/supabase/types";
import { ChatRoomClient } from "./ChatRoomClient";

const PAGE_SIZE = 30;

interface PartyRow {
  id: string;
  title: string | null;
  activities: { id: string; title: string } | null;
}

interface RoomRow {
  id: string;
  party_id: string;
  parties: PartyRow | null;
}

interface MemberRow {
  profile_id: string;
  is_leader: boolean;
  profiles: { nickname: string } | null;
  party_role_slots: { role_name: string } | null;
}

export default async function ChatRoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const { supabase, user } = await getCurrentUserAndProfile();

  if (!user) {
    redirect("/login");
  }

  const { data: room, error: roomError } = await supabase
    .from("chat_rooms")
    .select("id, party_id, parties(id, title, activities(id, title))")
    .eq("id", roomId)
    .maybeSingle<RoomRow>();

  if (roomError || !room || !room.parties) {
    notFound();
  }

  const [membersRes, messagesRes, blocksRes] = await Promise.all([
    supabase
      .from("party_members")
      .select("profile_id, is_leader, profiles(nickname), party_role_slots(role_name)")
      .eq("party_id", room.party_id)
      .eq("status", "active")
      .order("is_leader", { ascending: false })
      .returns<MemberRow[]>(),
    supabase
      .from("chat_messages")
      .select("id, chat_room_id, sender_id, message_type, body, client_message_id, created_at")
      .eq("chat_room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE)
      .returns<ChatMessage[]>(),
    supabase.from("blocks").select("blocker_id, blocked_id").or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`).returns<BlockRow[]>(),
  ]);
  const blockedIds = blockedCounterpartIds(user.id, blocksRes.data ?? []);

  const members = membersRes.data ?? [];
  const isMember = members.some((m) => m.profile_id === user.id);
  if (!isMember) {
    // RLS가 이미 비멤버에게는 room/messages를 비워서 돌려주지만, 방어적으로 한 번 더 막는다.
    notFound();
  }

  const rawMessages = messagesRes.data ?? [];
  const initialMessages = rawMessages.slice().reverse();
  const hasMoreOlder = rawMessages.length === PAGE_SIZE;

  // 방을 여는 시점에 서버에서 곧바로 읽음 처리한다(클라이언트 하트비트만 믿으면, 읽자마자 다른
  // 화면으로 이동하는 경우 그 비동기 호출이 완료되기 전에 떠나버려 안 읽음 배지가 늦게 지워진다).
  const latestMessageId = initialMessages.at(-1)?.id ?? null;
  await supabase.rpc("mark_chat_read", { p_chat_room_id: roomId, p_last_read_message_id: latestMessageId });

  const roomTitle = room.parties.title ?? room.parties.activities?.title ?? "팀 채팅";

  return (
    <PageContainer>
      <Link href="/chat" className="mb-3 inline-block text-sm text-[var(--color-brand-700)] underline">
        ← 채팅 목록으로
      </Link>
      <h1 className="mb-1 text-lg font-semibold">{roomTitle}</h1>

      <ul className="mb-3 flex flex-col gap-1">
        {members.map((m) => (
          <li key={m.profile_id} className="flex items-center justify-between gap-2 text-xs text-[var(--color-muted-foreground)]">
            <span>
              {m.profiles?.nickname ?? "멤버"}
              {m.is_leader ? "(팀장)" : ""}
              {m.party_role_slots ? ` · ${m.party_role_slots.role_name}` : ""}
            </span>
            {m.profile_id !== user.id && (
              <span className="flex items-center gap-2">
                <BlockToggleButton profileId={m.profile_id} initialBlocked={blockedIds.has(m.profile_id)} />
                <ReportButton targetType="profile" targetId={m.profile_id} />
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="mb-3 rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
        팀을 나가도 과거 채팅 내역은 팀에 남아요.
      </p>

      <ChatRoomClient
        roomId={roomId}
        currentUserId={user.id}
        initialMessages={initialMessages}
        initialHasMoreOlder={hasMoreOlder}
        blockedProfileIds={Array.from(blockedIds)}
      />
    </PageContainer>
  );
}
