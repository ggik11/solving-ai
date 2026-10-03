"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type DismissResult = { ok: true } | { ok: false; error: string };

export async function dismissRecommendation(
  activityId: string,
  feedback: "hidden" | "not_interested"
): Promise<DismissResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { ok: false, error: "로그인이 필요합니다." };
  }

  const { error } = await supabase
    .from("activity_feedback")
    .upsert({ profile_id: userData.user.id, activity_id: activityId, feedback }, { onConflict: "profile_id,activity_id" });

  if (error) {
    return { ok: false, error: `처리에 실패했습니다: ${error.message}` };
  }

  revalidatePath("/");
  return { ok: true };
}
