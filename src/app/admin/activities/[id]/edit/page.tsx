import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/PageContainer";
import { ActivityForm } from "../../ActivityForm";
import { MatchTemplatesManager, type MatchTemplateSummary } from "./MatchTemplatesManager";
import { ActivityFieldsManager, type ActivityFieldSummary } from "./ActivityFieldsManager";
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
  const [{ data: activity }, { data: activityTypes }, { data: majors }, { data: interests }, { data: templates }, { data: fields }] =
    await Promise.all([
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
      <ActivityForm mode="edit" activityId={activity.id} activityTypes={activityTypes ?? []} majors={majors ?? []} initial={activity} />

      <div className="mt-6">
        <ActivityFieldsManager activityId={activity.id} interests={interests ?? []} initialFields={fields ?? []} />
      </div>

      <div className="mt-6">
        <MatchTemplatesManager activityId={activity.id} templates={templateSummaries} />
      </div>
    </PageContainer>
  );
}
