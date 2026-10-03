"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** DB 함수는 'CODE: 설명' 형식으로 raise한다. 사용자에게는 설명만 보여준다. */
function friendlyError(error: { message: string } | null, fallback: string): string {
  if (!error) return fallback;
  const idx = error.message.indexOf(": ");
  return idx >= 0 ? error.message.slice(idx + 2) : error.message;
}

export interface CreatePartyInput {
  activityId: string;
  title: string;
  description: string;
  capacity: number;
  meetingMode: "online" | "offline" | "hybrid" | null;
  recruitDeadline: string | null; // ISO or ""
}

export async function createPartyAction(input: CreatePartyInput): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "로그인이 필요합니다." };

  const { data: partyId, error } = await supabase.rpc("create_party", {
    p_activity_id: input.activityId,
    p_title: input.title,
    p_description: input.description,
    p_capacity: input.capacity,
    p_meeting_mode: input.meetingMode,
    p_recruit_deadline: input.recruitDeadline || null,
  });

  if (error || !partyId) {
    return { ok: false, error: friendlyError(error, "파티 생성에 실패했습니다.") };
  }

  revalidatePath("/parties");
  revalidatePath(`/activities/${input.activityId}`);
  redirect(`/parties/${partyId}`);
}

export async function applyToPartyAction(partyId: string, message: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("apply_to_party", { p_party_id: partyId, p_message: message || null });
  if (error) return { ok: false, error: friendlyError(error, "지원에 실패했습니다.") };

  revalidatePath(`/parties/${partyId}`);
  revalidatePath("/parties");
  return { ok: true };
}

export async function cancelApplicationAction(applicationId: string, partyId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_application", { p_application_id: applicationId });
  if (error) return { ok: false, error: friendlyError(error, "지원 취소에 실패했습니다.") };

  revalidatePath(`/parties/${partyId}`);
  revalidatePath("/parties");
  return { ok: true };
}

export async function approveApplicationAction(applicationId: string, partyId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_application", { p_application_id: applicationId });
  if (error) return { ok: false, error: friendlyError(error, "승인에 실패했습니다.") };

  revalidatePath(`/parties/${partyId}`);
  revalidatePath("/parties");
  return { ok: true };
}

export async function rejectApplicationAction(applicationId: string, partyId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_application", { p_application_id: applicationId });
  if (error) return { ok: false, error: friendlyError(error, "거절에 실패했습니다.") };

  revalidatePath(`/parties/${partyId}`);
  revalidatePath("/parties");
  return { ok: true };
}

export async function leavePartyAction(partyId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("leave_party", { p_party_id: partyId });
  if (error) return { ok: false, error: friendlyError(error, "탈퇴에 실패했습니다.") };

  revalidatePath(`/parties/${partyId}`);
  revalidatePath("/parties");
  return { ok: true };
}

export async function delegateLeaderAction(partyId: string, newLeaderProfileId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delegate_leader", {
    p_party_id: partyId,
    p_new_leader_profile_id: newLeaderProfileId,
  });
  if (error) return { ok: false, error: friendlyError(error, "위임에 실패했습니다.") };

  revalidatePath(`/parties/${partyId}`);
  revalidatePath("/parties");
  return { ok: true };
}

export async function disbandPartyAction(partyId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("disband_party", { p_party_id: partyId });
  if (error) return { ok: false, error: friendlyError(error, "해산에 실패했습니다.") };

  revalidatePath(`/parties/${partyId}`);
  revalidatePath("/parties");
  return { ok: true };
}

export async function confirmPartyAction(partyId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_party", { p_party_id: partyId });
  if (error) return { ok: false, error: friendlyError(error, "확정에 실패했습니다.") };

  revalidatePath(`/parties/${partyId}`);
  revalidatePath("/parties");
  revalidatePath("/");
  return { ok: true };
}

export async function reopenPartyAction(partyId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reopen_party", { p_party_id: partyId });
  if (error) return { ok: false, error: friendlyError(error, "재모집 시작에 실패했습니다.") };

  revalidatePath(`/parties/${partyId}`);
  revalidatePath("/parties");
  return { ok: true };
}
