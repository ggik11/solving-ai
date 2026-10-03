import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/auth";
import { PageContainer } from "@/components/PageContainer";
import { SubmitActivityForm } from "./SubmitActivityForm";

export default async function SubmitActivityPage() {
  const { user } = await getCurrentUserAndProfile();
  if (!user) {
    redirect("/login");
  }

  return (
    <PageContainer>
      <Link href="/activities" className="mb-3 inline-block text-sm text-[var(--color-brand-700)] underline">
        ← 활동 탐색으로
      </Link>
      <h1 className="mb-4 text-xl font-semibold">활동 제보하기</h1>
      <SubmitActivityForm />
    </PageContainer>
  );
}
