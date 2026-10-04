"use server";

import { createClient } from "@/lib/supabase/server";
import { isCurrentUserAdmin } from "@/lib/auth";
import { runUrlImportPreview, type UrlImportPreviewResult } from "@/lib/activity-import/preview";

/**
 * 관리자 활동 등록 화면의 "URL로 가져오기". 서버 액션은 페이지 레이아웃의 인가 검사를
 * 거치지 않고 직접 호출될 수 있으므로, 관리자 여부를 여기서도 다시 확인한다(지시서 6장
 * 권한표: "모든 항목은 서버에서 재검증" 원칙).
 */
export async function previewActivityImportUrlAction(url: string): Promise<UrlImportPreviewResult> {
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) return { ok: false, error: "관리자만 사용할 수 있어요." };

  const supabase = await createClient();
  return runUrlImportPreview(supabase, url);
}
