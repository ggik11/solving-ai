"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isDuplicateKeyError } from "@/lib/errors";

export type BookmarkResult = { ok: true; bookmarked: boolean } | { ok: false; error: string };

const BOOKMARK_ERROR = "북마크 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.";

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
    if (error) return { ok: false, error: BOOKMARK_ERROR };
    revalidatePath("/me");
    revalidatePath(`/activities/${activityId}`);
    return { ok: true, bookmarked: false };
  }

  const { error } = await supabase.from("bookmarks").insert({ profile_id: profileId, activity_id: activityId });
  // 연타 등으로 거의 동시에 두 번째 요청이 들어와도 이미 북마크된 상태이므로 멱등하게
  // 성공으로 처리한다(blockUserAction과 같은 패턴).
  if (error && !isDuplicateKeyError(error)) return { ok: false, error: BOOKMARK_ERROR };
  revalidatePath("/me");
  revalidatePath(`/activities/${activityId}`);
  return { ok: true, bookmarked: true };
}
