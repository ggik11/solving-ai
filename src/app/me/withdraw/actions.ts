"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/errors";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function withdrawAccountAction(): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_account");
  if (error) return { ok: false, error: friendlyError(error, "탈퇴에 실패했습니다.") };

  await supabase.auth.signOut();
  redirect("/login?withdrawn=1");
}
