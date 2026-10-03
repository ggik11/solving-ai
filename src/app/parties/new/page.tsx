import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/auth";
import { PageContainer } from "@/components/PageContainer";
import { NewPartyForm } from "./NewPartyForm";

export default async function NewPartyPage({
  searchParams,
}: {
  searchParams: Promise<{ activity?: string }>;
}) {
  const { supabase, user } = await getCurrentUserAndProfile();
  if (!user) {
    redirect("/login");
  }

  const { activity: activityId } = await searchParams;
  if (!activityId) {
    notFound();
  }

  const { data: activity } = await supabase
    .from("activities")
    .select("id, title, participation_mode, status")
    .eq("id", activityId)
    .maybeSingle();

  if (!activity) {
    notFound();
  }

  return (
    <PageContainer>
      <Link href={`/activities/${activity.id}`} className="mb-3 inline-block text-sm text-[var(--color-brand-700)] underline">
        ← {activity.title}로
      </Link>
      <h1 className="mb-1 text-xl font-semibold">파티 만들기</h1>
      <p className="mb-4 text-sm text-[var(--color-muted-foreground)]">{activity.title}</p>

      {activity.status !== "published" || activity.participation_mode === "solo" ? (
        <p className="rounded-md border border-[var(--color-danger)]/30 bg-[var(--color-danger-bg)] px-4 py-3 text-sm text-[var(--color-danger)]">
          이 활동에는 파티를 만들 수 없어요. (공개된 팀 참여 활동만 가능)
        </p>
      ) : (
        <NewPartyForm activityId={activity.id} />
      )}
    </PageContainer>
  );
}
