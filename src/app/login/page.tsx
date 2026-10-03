import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/PageContainer";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; withdrawn?: string }>;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) {
    redirect("/");
  }

  const { error, withdrawn } = await searchParams;

  return (
    <PageContainer>
      <h1 className="mb-1 text-xl font-semibold">로그인</h1>
      <p className="mb-5 text-sm text-[var(--color-muted-foreground)]">
        상명메이트는 상명대학교 공식 서비스가 아닌 비공식 데모입니다.
      </p>
      {withdrawn && (
        <p className="mb-4 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm">
          회원 탈퇴가 완료되었어요. 그동안 이용해 주셔서 감사합니다.
        </p>
      )}
      <LoginForm initialError={error} />
    </PageContainer>
  );
}
