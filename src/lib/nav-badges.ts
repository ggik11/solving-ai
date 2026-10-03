import { createClient } from "@/lib/supabase/server";
import type { ChatRoomSummary } from "@/lib/supabase/types";

/** 하단 탭(BottomNav)에 표시할 안 읽은 수. 로그인하지 않았으면 전부 0. */
export async function getChatUnreadTotal(): Promise<number> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return 0;

  const { data } = await supabase.rpc("list_my_chat_rooms");
  const rooms = (data ?? []) as ChatRoomSummary[];
  return rooms.reduce((sum, room) => sum + (room.unread_count ?? 0), 0);
}
