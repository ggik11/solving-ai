"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ActivityStatus, LocationType, ParticipationMode } from "@/lib/supabase/types";

export interface ActivityFormInput {
  title: string;
  summary: string;
  description: string;
  orgName: string;
  sourceUrl: string;
  locationType: LocationType;
  region: string;
  activityTypeId: string;
  eligibility: string;
  participationMode: ParticipationMode;
  teamMinSize: string;
  teamMaxSize: string;
  benefit: string;
  applyStartAt: string;
  applyEndAt: string;
  activityStartAt: string;
  activityEndAt: string;
  status: ActivityStatus;
}

function toTimestamp(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toRow(input: ActivityFormInput) {
  return {
    title: input.title.trim(),
    summary: input.summary.trim() || null,
    description: input.description.trim() || null,
    org_name: input.orgName.trim() || null,
    source_url: input.sourceUrl.trim() || null,
    location_type: input.locationType,
    region: input.region.trim() || null,
    activity_type_id: input.activityTypeId || null,
    eligibility: input.eligibility.trim() || null,
    participation_mode: input.participationMode,
    team_min_size: input.teamMinSize ? Number(input.teamMinSize) : null,
    team_max_size: input.teamMaxSize ? Number(input.teamMaxSize) : null,
    benefit: input.benefit.trim() || null,
    apply_start_at: toTimestamp(input.applyStartAt),
    apply_end_at: toTimestamp(input.applyEndAt),
    activity_start_at: toTimestamp(input.activityStartAt),
    activity_end_at: toTimestamp(input.activityEndAt),
    status: input.status,
    last_verified_at: new Date().toISOString(),
  };
}

export async function createActivity(input: ActivityFormInput): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "로그인이 필요합니다." };

  if (!input.title.trim()) return { ok: false, error: "제목을 입력해 주세요." };

  const { error } = await supabase.from("activities").insert({ ...toRow(input), created_by: userData.user.id });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/activities");
  revalidatePath("/activities");
  redirect("/admin/activities");
}

export async function updateActivity(id: string, input: ActivityFormInput): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  if (!input.title.trim()) return { ok: false, error: "제목을 입력해 주세요." };

  const { error } = await supabase.from("activities").update(toRow(input)).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/activities");
  revalidatePath("/activities");
  revalidatePath(`/activities/${id}`);
  redirect("/admin/activities");
}

export async function setActivityStatus(id: string, status: ActivityStatus): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("activities").update({ status }).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/activities");
  revalidatePath("/activities");
  revalidatePath(`/activities/${id}`);
  return { ok: true };
}

/** <form action={...}>에 바인딩하기 위한 void 반환 래퍼. */
export async function setActivityStatusAction(id: string, status: ActivityStatus): Promise<void> {
  await setActivityStatus(id, status);
}

export interface BulkImportRow {
  title: string;
  summary: string | null;
  orgName: string | null;
  sourceUrl: string | null;
  locationType: LocationType | null;
  region: string | null;
  activityTypeName: string | null;
  eligibility: string | null;
  participationMode: ParticipationMode | null;
  teamMinSize: number | null;
  teamMaxSize: number | null;
  benefit: string | null;
  applyStartAt: string | null;
  applyEndAt: string | null;
  activityStartAt: string | null;
  activityEndAt: string | null;
}

export async function bulkImportActivities(
  rows: BulkImportRow[]
): Promise<{ ok: true; inserted: number } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "로그인이 필요합니다." };
  if (rows.length === 0) return { ok: true, inserted: 0 };

  const { data: types } = await supabase.from("activity_types").select("id, name");
  const typeByName = new Map((types ?? []).map((t) => [t.name, t.id] as const));

  const payload = rows.map((row) => ({
    title: row.title,
    summary: row.summary,
    org_name: row.orgName,
    source_url: row.sourceUrl,
    location_type: row.locationType ?? "offline",
    region: row.region,
    activity_type_id: row.activityTypeName ? typeByName.get(row.activityTypeName) ?? null : null,
    eligibility: row.eligibility,
    participation_mode: row.participationMode ?? "both",
    team_min_size: row.teamMinSize,
    team_max_size: row.teamMaxSize,
    benefit: row.benefit,
    apply_start_at: row.applyStartAt,
    apply_end_at: row.applyEndAt,
    activity_start_at: row.activityStartAt,
    activity_end_at: row.activityEndAt,
    status: "draft" as ActivityStatus, // CSV로 들어온 활동은 비공개(draft)로 시작, 운영자가 검토 후 공개.
    created_by: userData.user.id,
    is_demo: false,
    last_verified_at: null,
  }));

  const { error } = await supabase.from("activities").insert(payload);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/activities");
  revalidatePath("/activities");
  return { ok: true, inserted: payload.length };
}

export async function fetchExistingActivityKeys(): Promise<{ title: string; orgName: string | null }[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("activities").select("title, org_name");
  return (data ?? []).map((row) => ({ title: row.title, orgName: row.org_name }));
}
