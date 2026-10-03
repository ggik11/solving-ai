"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/errors";

export type ActionResult = { ok: true } | { ok: false; error: string };

export interface JoinMatchingQueueInput {
  activityId: string;
  templateId: string;
  eligibleRoles: string[];
  willingLeader: boolean;
  continueOnFail: boolean;
}

export async function joinMatchingQueueAction(input: JoinMatchingQueueInput): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("join_matching_queue", {
    p_activity_id: input.activityId,
    p_template_id: input.templateId,
    p_eligible_roles: input.eligibleRoles,
    p_willing_leader: input.willingLeader,
    p_continue_on_fail: input.continueOnFail,
  });
  if (error) return { ok: false, error: friendlyError(error, "매칭 참가에 실패했습니다.") };

  revalidatePath(`/match/${input.activityId}`);
  return { ok: true };
}

export async function cancelMatchingQueueAction(queueId: string, activityId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_matching_queue", { p_queue_id: queueId });
  if (error) return { ok: false, error: friendlyError(error, "대기 취소에 실패했습니다.") };

  revalidatePath(`/match/${activityId}`);
  return { ok: true };
}

export async function respondToMatchProposalAction(
  proposalId: string,
  accept: boolean,
  activityId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_to_match_proposal", { p_proposal_id: proposalId, p_accept: accept });
  if (error) return { ok: false, error: friendlyError(error, "응답 처리에 실패했습니다.") };

  revalidatePath(`/match/${activityId}`);
  revalidatePath("/chat");
  revalidatePath("/parties");
  return { ok: true };
}
