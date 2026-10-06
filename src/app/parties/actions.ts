"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/errors";
import { RECRUIT_DEADLINE_ISSUE_LABEL, validateRecruitDeadline } from "@/lib/party";

export type ActionResult = { ok: true } | { ok: false; error: string };

export interface RoleSlotInput {
  roleName: string;
  capacity: number;
}

export interface CreatePartyInput {
  activityId: string;
  title: string;
  description: string;
  meetingMode: "online" | "offline" | "hybrid" | null;
  recruitDeadline: string | null; // ISO or ""
  roleSlots: RoleSlotInput[];
  leaderRoleName: string;
}

export async function createPartyAction(input: CreatePartyInput): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "로그인이 필요합니다." };

  // 서버 액션은 폼의 클라이언트 쪽 검증을 거치지 않고 직접 호출될 수 있으므로 여기서도 다시
  // 검사한다 — 잘못된 날짜 문자열이 그대로 RPC(timestamptz 인자)에 전달되면 원문 그대로의
  // Postgres 타입 캐스팅 오류가 노출된다.
  const deadlineIssue = validateRecruitDeadline(input.recruitDeadline);
  if (deadlineIssue) {
    return { ok: false, error: `모집 마감: ${RECRUIT_DEADLINE_ISSUE_LABEL[deadlineIssue]}` };
  }

  const { data: partyId, error } = await supabase.rpc("create_party", {
    p_activity_id: input.activityId,
    p_title: input.title,
    p_description: input.description,
    p_meeting_mode: input.meetingMode,
    p_recruit_deadline: input.recruitDeadline || null,
    p_role_slots: input.roleSlots.map((r) => ({ role_name: r.roleName, capacity: r.capacity })),
    p_leader_role_name: input.leaderRoleName,
  });

  if (error || !partyId) {
    return { ok: false, error: friendlyError(error, "파티 생성에 실패했습니다.") };
  }

  revalidatePath("/parties");
  revalidatePath(`/activities/${input.activityId}`);
  redirect(`/parties/${partyId}`);
}

export async function applyToPartyAction(partyId: string, roleSlotId: string, message: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("apply_to_party", {
    p_party_id: partyId,
    p_role_slot_id: roleSlotId,
    p_message: message || null,
  });
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

export interface UpdatePartyDetailsInput {
  partyId: string;
  title: string;
  description: string;
  meetingMode: "online" | "offline" | "hybrid" | null;
  recruitDeadline: string | null;
  requiredCommonTime: string; // 자유 형식 텍스트 → {"note": text} 로 저장
  roleSlotCapacities: { roleSlotId: string; capacity: number }[];
}

export async function updatePartyDetailsAction(input: UpdatePartyDetailsInput): Promise<ActionResult> {
  const supabase = await createClient();

  // 폼의 클라이언트 검증과 같은 규칙을 서버에서도 다시 확인한다(서버 액션 직접 호출 대비).
  const deadlineIssue = validateRecruitDeadline(input.recruitDeadline);
  if (deadlineIssue) {
    return { ok: false, error: `모집 마감: ${RECRUIT_DEADLINE_ISSUE_LABEL[deadlineIssue]}` };
  }

  const { error } = await supabase.rpc("update_party_details", {
    p_party_id: input.partyId,
    p_title: input.title,
    p_description: input.description,
    p_meeting_mode: input.meetingMode,
    p_recruit_deadline: input.recruitDeadline || null,
    p_required_common_time: input.requiredCommonTime.trim() ? { note: input.requiredCommonTime.trim() } : null,
    p_role_slot_capacities: input.roleSlotCapacities.map((r) => ({ role_slot_id: r.roleSlotId, capacity: r.capacity })),
  });
  if (error) return { ok: false, error: friendlyError(error, "파티 정보 수정에 실패했습니다.") };

  revalidatePath(`/parties/${input.partyId}`);
  revalidatePath(`/parties/${input.partyId}/edit`);
  revalidatePath("/parties");
  return { ok: true };
}
