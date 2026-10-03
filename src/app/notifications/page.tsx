import { redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/auth";
import { PageContainer } from "@/components/PageContainer";
import { EmptyState } from "@/components/states";
import type { NotificationRow } from "@/lib/supabase/types";
import { NotificationList, type NotificationItem } from "./NotificationList";

function notificationHref(n: Pick<NotificationRow, "target_type" | "target_id">): string | null {
  if (!n.target_id) return null;
  if (n.target_type === "party") return `/parties/${n.target_id}`;
  if (n.target_type === "chat_room") return `/chat/${n.target_id}`;
  return null;
}

export default async function NotificationsPage() {
  const { supabase, user } = await getCurrentUserAndProfile();
  if (!user) {
    redirect("/login");
  }

  const { data } = await supabase
    .from("notifications")
    .select("id, type, target_type, target_id, title, body, read_at, created_at")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<NotificationRow[]>();

  const notifications: NotificationItem[] = (data ?? []).map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    read_at: n.read_at,
    created_at: n.created_at,
    href: notificationHref(n),
  }));

  return (
    <PageContainer>
      <h1 className="mb-4 text-xl font-semibold">알림</h1>
      {notifications.length > 0 ? (
        <NotificationList notifications={notifications} />
      ) : (
        <EmptyState title="아직 알림이 없어요" />
      )}
    </PageContainer>
  );
}
