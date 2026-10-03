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
}

export type ActionResult = { ok: true } | { ok: false; error: string };

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
  });
  if (error || !data) return { ok: false, error: friendlyError(error, "제보에 실패했습니다.") };

  redirect("/activities/submit/done");
}
