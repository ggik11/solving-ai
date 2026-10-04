"use server";

import { createClient } from "@/lib/supabase/server";
import { runUrlImportPreview, type UrlImportPreviewResult } from "@/lib/activity-import/preview";

/** 사용자 제보 화면의 "URL로 가져오기". 로그인 사용자만 — 실제 빈도 제한·권한 검사는
 * `check_url_fetch_rate_limit()` RPC(authenticated 전용)가 한다. */
export async function previewActivitySubmissionUrlAction(url: string): Promise<UrlImportPreviewResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "로그인이 필요해요." };

  return runUrlImportPreview(supabase, url);
}
