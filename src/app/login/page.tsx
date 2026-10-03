import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/PageContainer";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) {
    redirect("/");
  }

  const { error } = await searchParams;

  return (
    <PageContainer>
      <h1 className="mb-1 text-xl font-semibold">로그인</h1>
      <p className="mb-5 text-sm text-[var(--color-muted-foreground)]">
        상명메이트는 상명대학교 공식 서비스가 아닌 비공식 데모입니다.
      </p>
      <LoginForm initialError={error} />
    </PageContainer>
  );
}
