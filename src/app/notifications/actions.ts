"use server";

import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/errors";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function markNotificationReadAction(notificationId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_notification_read", { p_notification_id: notificationId });
  if (error) return { ok: false, error: friendlyError(error, "읽음 처리에 실패했습니다.") };
  return { ok: true };
}

export async function markAllNotificationsReadAction(): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_all_notifications_read");
  if (error) return { ok: false, error: friendlyError(error, "읽음 처리에 실패했습니다.") };
  return { ok: true };
}
