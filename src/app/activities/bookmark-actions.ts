"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type BookmarkResult = { ok: true; bookmarked: boolean } | { ok: false; error: string };

export async function toggleBookmark(activityId: string): Promise<BookmarkResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { ok: false, error: "로그인이 필요합니다." };
  }
  const profileId = userData.user.id;

  const { data: existing } = await supabase
    .from("bookmarks")
    .select("activity_id")
    .eq("profile_id", profileId)
    .eq("activity_id", activityId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("bookmarks")
      .delete()
      .eq("profile_id", profileId)
      .eq("activity_id", activityId);
    if (error) return { ok: false, error: `북마크 해제에 실패했습니다: ${error.message}` };
    revalidatePath("/me");
    revalidatePath(`/activities/${activityId}`);
    return { ok: true, bookmarked: false };
  }

  const { error } = await supabase.from("bookmarks").insert({ profile_id: profileId, activity_id: activityId });
  if (error) return { ok: false, error: `북마크에 실패했습니다: ${error.message}` };
  revalidatePath("/me");
  revalidatePath(`/activities/${activityId}`);
  return { ok: true, bookmarked: true };
}
