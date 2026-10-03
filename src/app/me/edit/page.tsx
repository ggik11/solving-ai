import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/PageContainer";
import { ProfileWizard } from "../../onboarding/ProfileWizard";
import { loadReferenceData, loadCurrentProfileData } from "../../onboarding/actions";

export default async function EditProfilePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    redirect("/login");
  }

  const [reference, initial] = await Promise.all([loadReferenceData(), loadCurrentProfileData()]);
  if (!initial) {
    redirect("/login");
  }

  return (
    <PageContainer>
      <h1 className="mb-1 text-xl font-semibold">프로필 수정</h1>
      <p className="mb-5 text-sm text-[var(--color-muted-foreground)]">
        수정하면 추천 계산(3단계)에도 반영돼요.
      </p>
      <ProfileWizard mode="edit" reference={reference} initial={initial} />
    </PageContainer>
  );
}
