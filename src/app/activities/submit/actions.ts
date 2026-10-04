"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/errors";
import type { LocationType, ParticipationMode } from "@/lib/supabase/types";

export interface SubmitActivityInput {
  title: string;
  summary: string;
  description: string;
  orgName: string;
  sourceUrl: string;
  locationType: LocationType;
  region: string;
  participationMode: ParticipationMode;
  applyStartAt: string;
  applyEndAt: string;
  /** URL 가져오기로 채운 경우의 출처 메타데이터(선택). 수동 입력일 때는 비워둔다. */
  sourceUrlResolved?: string;
  applyEndAtEvidence?: string;
}

export type ActionResult = { ok: true } | { ok: false; error: string };

function toTimestamp(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function submitActivityAction(input: SubmitActivityInput): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_activity", {
    p_title: input.title,
    p_summary: input.summary || null,
    p_description: input.description || null,
    p_org_name: input.orgName || null,
    p_source_url: input.sourceUrl || null,
    p_location_type: input.locationType,
    p_region: input.region || null,
    p_participation_mode: input.participationMode,
    p_apply_start_at: toTimestamp(input.applyStartAt),
    p_apply_end_at: toTimestamp(input.applyEndAt),
    p_source_url_resolved: input.sourceUrlResolved || null,
    p_apply_end_at_evidence: input.applyEndAtEvidence || null,
  });
  if (error || !data) return { ok: false, error: friendlyError(error, "제보에 실패했습니다.") };

  redirect("/activities/submit/done");
}
