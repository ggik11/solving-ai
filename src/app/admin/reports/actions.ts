"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/errors";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function updateReportStatusAction(
  reportId: string,
  status: "open" | "reviewing" | "resolved" | "dismissed",
  resolutionNote: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_report_status", {
    p_report_id: reportId,
    p_status: status,
    p_resolution_note: resolutionNote || null,
  });
  if (error) return { ok: false, error: friendlyError(error, "신고 처리에 실패했습니다.") };

  revalidatePath("/admin/reports");
  revalidatePath("/admin/audit-logs");
  return { ok: true };
}

export interface ReportedMessageContextRow {
  id: string;
  sender_nickname: string;
  message_type: string;
  body: string;
  created_at: string;
  is_reported_message: boolean;
}

export type MessageContextResult = { ok: true; messages: ReportedMessageContextRow[] } | { ok: false; error: string };

export async function viewReportedMessageContextAction(reportId: string): Promise<MessageContextResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_reported_message_context", {
    p_report_id: reportId,
    p_context_size: 3,
  });
  if (error) return { ok: false, error: friendlyError(error, "메시지를 불러오지 못했습니다.") };

  revalidatePath("/admin/audit-logs");
  return { ok: true, messages: (data ?? []) as ReportedMessageContextRow[] };
}
