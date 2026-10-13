import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/PageContainer";
import { ActivityForm } from "../ActivityForm";

export default async function NewActivityPage() {
  const supabase = await createClient();
  const [{ data: activityTypes }, { data: majors }] = await Promise.all([
    supabase.from("activity_types").select("id, name").order("name"),
    supabase.from("majors").select("id, name, department").eq("is_active", true).order("sort_order"),
  ]);

  return (
    <PageContainer>
      <h1 className="mb-4 text-xl font-semibold">새 활동 등록</h1>
      <ActivityForm mode="create" activityTypes={activityTypes ?? []} majors={majors ?? []} />
    </PageContainer>
  );
}
