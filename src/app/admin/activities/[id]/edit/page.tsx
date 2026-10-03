import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/PageContainer";
import { ActivityForm } from "../../ActivityForm";
import type { Activity } from "@/lib/supabase/types";

export default async function EditActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: activity }, { data: activityTypes }] = await Promise.all([
    supabase.from("activities").select("*").eq("id", id).maybeSingle<Activity>(),
    supabase.from("activity_types").select("id, name").order("name"),
  ]);

  if (!activity) {
    notFound();
  }

  return (
    <PageContainer>
      <h1 className="mb-4 text-xl font-semibold">활동 수정</h1>
      <ActivityForm mode="edit" activityId={activity.id} activityTypes={activityTypes ?? []} initial={activity} />
    </PageContainer>
  );
}
