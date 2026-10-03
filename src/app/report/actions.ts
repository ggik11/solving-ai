"use server";

import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/errors";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function createReportAction(
  targetType: "profile" | "party" | "chat_message" | "activity",
  targetId: string,
  reason: string,
  description: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_report", {
    p_target_type: targetType,
    p_target_id: targetId,
    p_reason: reason,
    p_description: description || null,
  });
  if (error) return { ok: false, error: friendlyError(error, "신고에 실패했습니다.") };
  return { ok: true };
}
