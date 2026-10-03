import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isCurrentUserAdmin } from "@/lib/auth";
import { PageContainer } from "@/components/PageContainer";
import { ForbiddenState } from "@/components/states";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    redirect("/login");
  }

  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) {
    return (
      <PageContainer>
        <ForbiddenState message="관리자만 접근할 수 있는 화면입니다." />
      </PageContainer>
    );
  }

  return <>{children}</>;
}
