import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/auth";
import { PageContainer } from "@/components/PageContainer";
import { EmptyState } from "@/components/states";
import { formatKst } from "@/lib/format";
import type { ChatRoomSummary } from "@/lib/supabase/types";

export default async function ChatPage() {
  const { supabase, user } = await getCurrentUserAndProfile();
  if (!user) {
    redirect("/login");
  }

  const { data } = await supabase.rpc("list_my_chat_rooms");
  const rooms = (data ?? []) as ChatRoomSummary[];

  return (
    <PageContainer>
      <h1 className="mb-4 text-xl font-semibold">채팅</h1>

      {rooms && rooms.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {rooms.map((room) => (
            <li key={room.chat_room_id}>
              <Link
                href={`/chat/${room.chat_room_id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{room.party_title ?? room.activity_title}</p>
                  <p className="truncate text-xs text-[var(--color-muted-foreground)]">
                    {room.last_message_body
                      ? `${room.last_message_sender_nickname ?? "시스템"}: ${room.last_message_body}`
                      : "아직 메시지가 없어요"}
                  </p>
                  {room.last_message_at && (
                    <p className="text-[11px] text-[var(--color-muted-foreground)]">{formatKst(room.last_message_at)}</p>
                  )}
                </div>
                {room.unread_count > 0 && (
                  <span
                    aria-label={`안 읽은 메시지 ${room.unread_count}개`}
                    className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-danger)] px-1.5 text-xs font-semibold text-white"
                  >
                    {room.unread_count > 99 ? "99+" : room.unread_count}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="아직 채팅방이 없어요"
          description="파티에 가입하거나 지원이 승인되면 팀 채팅이 자동으로 열려요."
        />
      )}
    </PageContainer>
  );
}
