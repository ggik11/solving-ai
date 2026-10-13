"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ActivityStatus, EligibilityScope, LocationType, ParticipationMode } from "@/lib/supabase/types";

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
  /** URL 가져오기로 채운 경우의 출처 메타데이터(선택). 수동 입력일 때는 비워둔다. */
  sourceUrlResolved?: string;
  applyEndAtEvidence?: string;
  /** 주당 예상 투입 시간(원문에 있을 때만). 비워두면 미상으로 추천 계산에서 제외된다. */
  weeklyHours: string;
  /** 지원 자격 범위 — 전공 관련성(추천)과는 별개. any/unknown은 eligibleMajorIds를 쓰지 않는다. */
  eligibilityScope: EligibilityScope;
  eligibleMajorIds: string[];
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
    source_url_resolved: input.sourceUrlResolved?.trim() || null,
    apply_end_at_evidence: input.applyEndAtEvidence?.trim() || null,
    weekly_hours: input.weeklyHours ? Number(input.weeklyHours) : null,
    eligibility_scope: input.eligibilityScope,
    eligible_major_ids: input.eligibilityScope === "restricted" ? input.eligibleMajorIds : [],
    // scope를 any/restricted로 명시한다는 것 자체가 원문을 보고 고른 것이므로 확인 시각을 남긴다.
    // unknown으로 되돌리면(아직 확인 전) 확인 시각도 비운다.
    eligibility_verified_at: input.eligibilityScope === "unknown" ? null : new Date().toISOString(),
  };
}

export async function createActivity(input: ActivityFormInput): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "로그인이 필요합니다." };

  if (!input.title.trim()) return { ok: false, error: "제목을 입력해 주세요." };
  if (input.eligibilityScope === "restricted" && input.eligibleMajorIds.length === 0) {
    return { ok: false, error: "지정 전공 제한이면 전공을 하나 이상 선택해 주세요." };
  }

  const { error } = await supabase.from("activities").insert({ ...toRow(input), created_by: userData.user.id });
  if (error) return { ok: false, error: "활동 등록에 실패했습니다. 입력값을 확인하고 다시 시도해 주세요." };

  revalidatePath("/admin/activities");
  revalidatePath("/activities");
  redirect("/admin/activities");
}

export async function updateActivity(id: string, input: ActivityFormInput): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  if (!input.title.trim()) return { ok: false, error: "제목을 입력해 주세요." };
  if (input.eligibilityScope === "restricted" && input.eligibleMajorIds.length === 0) {
    return { ok: false, error: "지정 전공 제한이면 전공을 하나 이상 선택해 주세요." };
  }

  const { error } = await supabase.from("activities").update(toRow(input)).eq("id", id);
  if (error) return { ok: false, error: "활동 수정에 실패했습니다. 입력값을 확인하고 다시 시도해 주세요." };

  revalidatePath("/admin/activities");
  revalidatePath("/activities");
  revalidatePath(`/activities/${id}`);
  redirect("/admin/activities");
}

export async function setActivityStatus(id: string, status: ActivityStatus): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("activities").update({ status }).eq("id", id);
  if (error) return { ok: false, error: "상태 변경에 실패했습니다. 잠시 후 다시 시도해 주세요." };

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
  if (error) return { ok: false, error: "일괄 등록에 실패했습니다. 입력값을 확인하고 다시 시도해 주세요." };

  revalidatePath("/admin/activities");
  revalidatePath("/activities");
  return { ok: true, inserted: payload.length };
}

export async function fetchExistingActivityKeys(): Promise<{ title: string; orgName: string | null }[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("activities").select("title, org_name");
  return (data ?? []).map((row) => ({ title: row.title, orgName: row.org_name }));
}

// ---------------------------------------------------------------------------
// 빠른 매칭 역할 구성 템플릿 (4-B단계). activities처럼 테이블 RLS가 운영자 전용이라
// DB 함수 없이 직접 테이블을 쓴다.
// ---------------------------------------------------------------------------
export interface MatchTemplateRoleInput {
  roleName: string;
  capacity: number;
}

export async function createMatchTemplateAction(
  activityId: string,
  name: string,
  roles: MatchTemplateRoleInput[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();

  if (!name.trim()) return { ok: false, error: "템플릿 이름을 입력해 주세요." };
  if (roles.length === 0 || roles.some((r) => !r.roleName.trim())) {
    return { ok: false, error: "역할 이름을 모두 입력해 주세요." };
  }
  if (roles.some((r) => !Number.isInteger(r.capacity) || r.capacity < 1)) {
    return { ok: false, error: "역할별 인원은 1명 이상의 숫자로 입력해 주세요." };
  }
  const names = roles.map((r) => r.roleName.trim());
  if (new Set(names).size !== names.length) {
    return { ok: false, error: "역할 이름이 중복되지 않게 입력해 주세요." };
  }

  const { data: template, error } = await supabase
    .from("activity_match_templates")
    .insert({ activity_id: activityId, name: name.trim() })
    .select("id")
    .single();
  if (error || !template) return { ok: false, error: "템플릿 생성에 실패했습니다. 잠시 후 다시 시도해 주세요." };

  const { error: rolesError } = await supabase
    .from("activity_match_template_roles")
    .insert(roles.map((r) => ({ template_id: template.id, role_name: r.roleName.trim(), capacity: r.capacity })));
  if (rolesError) {
    await supabase.from("activity_match_templates").delete().eq("id", template.id);
    return { ok: false, error: "템플릿 역할 저장에 실패했습니다. 잠시 후 다시 시도해 주세요." };
  }

  revalidatePath(`/admin/activities/${activityId}/edit`);
  revalidatePath(`/activities/${activityId}`);
  return { ok: true };
}

export async function setMatchTemplateActiveAction(
  templateId: string,
  activityId: string,
  isActive: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("activity_match_templates").update({ is_active: isActive }).eq("id", templateId);
  if (error) return { ok: false, error: "템플릿 상태 변경에 실패했습니다. 잠시 후 다시 시도해 주세요." };

  revalidatePath(`/admin/activities/${activityId}/edit`);
  revalidatePath(`/activities/${activityId}`);
  return { ok: true };
}

export async function deleteMatchTemplateAction(
  templateId: string,
  activityId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("activity_match_templates").delete().eq("id", templateId);
  if (error) {
    // 23503 = FK 위반(matching_queue/match_proposals가 이 템플릿을 참조 중) — 그 외의 실패
    // 원인(권한, 네트워크 등)은 다른 문구로 구분해 사용자가 잘못 짐작하지 않게 한다.
    if (error.code === "23503") {
      return { ok: false, error: "이미 참가 신청이 있는 템플릿은 삭제할 수 없어요. 대신 비활성화해 주세요." };
    }
    return { ok: false, error: "템플릿 삭제에 실패했습니다. 잠시 후 다시 시도해 주세요." };
  }

  revalidatePath(`/admin/activities/${activityId}/edit`);
  revalidatePath(`/activities/${activityId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 활동 분야 확정 (G2, activity_fields). activities/activity_tags처럼 테이블 RLS가
// 운영자 전용이라 DB 함수 없이 직접 테이블을 쓴다. "전체 삭제 후 다시 삽입"으로 멱등하게 반영한다.
// ---------------------------------------------------------------------------
export async function setActivityFieldsAction(
  activityId: string,
  primaryInterestId: string | null,
  secondaryInterestIds: string[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "로그인이 필요합니다." };

  const secondary = secondaryInterestIds.filter((id) => id !== primaryInterestId);
  if (new Set(secondary).size !== secondary.length) {
    return { ok: false, error: "같은 분야를 두 번 선택할 수 없어요." };
  }

  const { error: deleteError } = await supabase.from("activity_fields").delete().eq("activity_id", activityId);
  if (deleteError) return { ok: false, error: "분야 확정에 실패했습니다. 잠시 후 다시 시도해 주세요." };

  const rows = [
    ...(primaryInterestId ? [{ interest_id: primaryInterestId, role: "primary" as const }] : []),
    ...secondary.map((interestId) => ({ interest_id: interestId, role: "secondary" as const })),
  ];
  if (rows.length > 0) {
    const { error: insertError } = await supabase.from("activity_fields").insert(
      rows.map((r) => ({
        activity_id: activityId,
        interest_id: r.interest_id,
        role: r.role,
        source: "manual",
        confirmed_by: userData.user!.id,
      }))
    );
    if (insertError) return { ok: false, error: "분야 확정에 실패했습니다. 잠시 후 다시 시도해 주세요." };
  }

  revalidatePath(`/admin/activities/${activityId}/edit`);
  revalidatePath(`/activities/${activityId}`);
  revalidatePath("/");
  return { ok: true };
}
