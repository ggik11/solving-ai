"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/errors";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function suspendAccountAction(profileId: string, reason: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("suspend_account", { p_profile_id: profileId, p_reason: reason || null });
  if (error) return { ok: false, error: friendlyError(error, "정지에 실패했습니다.") };

  revalidatePath("/admin/accounts");
  revalidatePath("/admin/audit-logs");
  return { ok: true };
}

export async function unsuspendAccountAction(profileId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("unsuspend_account", { p_profile_id: profileId });
  if (error) return { ok: false, error: friendlyError(error, "정지 해제에 실패했습니다.") };

  revalidatePath("/admin/accounts");
  revalidatePath("/admin/audit-logs");
  return { ok: true };
}
