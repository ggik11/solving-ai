import { createClient } from "@/lib/supabase/server";
import type { ChatRoomSummary } from "@/lib/supabase/types";

export interface NavBadgeCounts {
  chatUnread: number;
  notificationUnread: number;
}

/** 하단 탭(BottomNav)에 표시할 안 읽은 수. 로그인하지 않았으면 전부 0. */
export async function getNavBadgeCounts(): Promise<NavBadgeCounts> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { chatUnread: 0, notificationUnread: 0 };

  const [roomsRes, notificationsRes] = await Promise.all([
    supabase.rpc("list_my_chat_rooms"),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", userData.user.id)
      .is("read_at", null),
  ]);

  const rooms = (roomsRes.data ?? []) as ChatRoomSummary[];
  const chatUnread = rooms.reduce((sum, room) => sum + (room.unread_count ?? 0), 0);
  const notificationUnread = notificationsRes.count ?? 0;

  return { chatUnread, notificationUnread };
}
