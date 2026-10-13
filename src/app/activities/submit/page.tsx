import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/auth";
import { PageContainer } from "@/components/PageContainer";
import { SubmitActivityForm } from "./SubmitActivityForm";
import { loadPosterClassifierConfig } from "@/lib/poster/query";

export default async function SubmitActivityPage() {
  const { supabase, user } = await getCurrentUserAndProfile();
  if (!user) {
    redirect("/login");
  }

  const [{ data: interests }, posterConfig] = await Promise.all([
    supabase.from("interests").select("id, name").eq("is_active", true).order("sort_order"),
    loadPosterClassifierConfig(supabase),
  ]);

  return (
    <PageContainer>
      <Link href="/activities" className="mb-3 inline-block text-sm text-[var(--color-brand-700)] underline">
        ← 활동 탐색으로
      </Link>
      <h1 className="mb-4 text-xl font-semibold">활동 제보하기</h1>
      <SubmitActivityForm interests={interests ?? []} posterConfig={posterConfig} />
    </PageContainer>
  );
}
