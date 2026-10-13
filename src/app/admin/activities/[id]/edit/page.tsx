import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/PageContainer";
import { EditActivityClient } from "./EditActivityClient";
import type { MatchTemplateSummary } from "./MatchTemplatesManager";
import type { ActivityFieldSummary } from "./ActivityFieldsManager";
import { PosterAnalysisHistory, type PosterAnalysisHistoryRow } from "./PosterAnalysisHistory";
import { loadPosterClassifierConfig } from "@/lib/poster/query";
import type { Activity } from "@/lib/supabase/types";

interface TemplateRow {
  id: string;
  name: string;
  is_active: boolean;
  activity_match_template_roles: { role_name: string; capacity: number }[];
}

export default async function EditActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [
    { data: activity },
    { data: activityTypes },
    { data: majors },
    { data: interests },
    { data: templates },
    { data: fields },
    { data: analyses },
    posterConfig,
  ] = await Promise.all([
    supabase.from("activities").select("*").eq("id", id).maybeSingle<Activity>(),
    supabase.from("activity_types").select("id, name").order("name"),
    supabase.from("majors").select("id, name, department").eq("is_active", true).order("sort_order"),
    supabase.from("interests").select("id, name").eq("is_active", true).order("sort_order"),
    supabase
      .from("activity_match_templates")
      .select("id, name, is_active, activity_match_template_roles(role_name, capacity)")
      .eq("activity_id", id)
      .order("created_at", { ascending: true })
      .returns<TemplateRow[]>(),
    supabase.from("activity_fields").select("interest_id, role").eq("activity_id", id).returns<ActivityFieldSummary[]>(),
    supabase
      .from("poster_analyses")
      .select("id, model_version, status, top_class, top_score, failure_reason, created_at")
      .eq("activity_id", id)
      .order("created_at", { ascending: false })
      .returns<PosterAnalysisHistoryRow[]>(),
    loadPosterClassifierConfig(supabase),
  ]);

  if (!activity) {
    notFound();
  }

  const templateSummaries: MatchTemplateSummary[] = (templates ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    isActive: t.is_active,
    roles: t.activity_match_template_roles.map((r) => ({ roleName: r.role_name, capacity: r.capacity })),
  }));

  return (
    <PageContainer>
      <h1 className="mb-4 text-xl font-semibold">활동 수정</h1>
      <EditActivityClient
        activity={activity}
        activityTypes={activityTypes ?? []}
        majors={majors ?? []}
        interests={interests ?? []}
        templates={templateSummaries}
        fields={fields ?? []}
        posterConfig={posterConfig}
      />

      <div className="mt-6">
        <PosterAnalysisHistory analyses={analyses ?? []} />
      </div>
    </PageContainer>
  );
}
