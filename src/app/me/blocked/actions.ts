"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isDuplicateKeyError } from "@/lib/errors";

export type ActionResult = { ok: true } | { ok: false; error: string };

// blocks 테이블 RLS(blocker_id = auth.uid())가 이미 본인 차단 생성/해제만 허용하므로, bookmarks와
// 같은 패턴(직접 테이블 쓰기)으로 충분하다 — 정원·동시성 같은 불변식이 없는 단순 토글.
export async function blockUserAction(blockedId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "로그인이 필요합니다." };
  if (userData.user.id === blockedId) return { ok: false, error: "자신을 차단할 수 없습니다." };

  const { error } = await supabase
    .from("blocks")
    .insert({ blocker_id: userData.user.id, blocked_id: blockedId });
  if (error && !isDuplicateKeyError(error)) {
    return { ok: false, error: "차단에 실패했습니다. 잠시 후 다시 시도해 주세요." };
  }

  revalidatePath("/me/blocked");
  revalidatePath("/chat");
  revalidatePath("/parties");
  return { ok: true };
}

export async function unblockUserAction(blockedId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "로그인이 필요합니다." };

  const { error } = await supabase
    .from("blocks")
    .delete()
    .eq("blocker_id", userData.user.id)
    .eq("blocked_id", blockedId);
  if (error) return { ok: false, error: "차단 해제에 실패했습니다. 잠시 후 다시 시도해 주세요." };

  revalidatePath("/me/blocked");
  revalidatePath("/chat");
  revalidatePath("/parties");
  return { ok: true };
}
