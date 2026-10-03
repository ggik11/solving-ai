"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/errors";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function approveActivitySubmissionAction(activityId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_activity_submission", { p_activity_id: activityId });
  if (error) return { ok: false, error: friendlyError(error, "승인에 실패했습니다.") };

  revalidatePath("/admin/submissions");
  revalidatePath("/admin/activities");
  revalidatePath("/activities");
  revalidatePath("/admin/audit-logs");
  return { ok: true };
}

export async function rejectActivitySubmissionAction(activityId: string, note: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_activity_submission", { p_activity_id: activityId, p_note: note || null });
  if (error) return { ok: false, error: friendlyError(error, "거절에 실패했습니다.") };

  revalidatePath("/admin/submissions");
  revalidatePath("/admin/audit-logs");
  return { ok: true };
}
