import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/PageContainer";
import { ProfileWizard } from "./ProfileWizard";
import { loadReferenceData, loadCurrentProfileData } from "./actions";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed_at")
    .eq("id", data.user.id)
    .single();
  if (profile?.onboarding_completed_at) {
    redirect("/");
  }

  const [reference, initial] = await Promise.all([loadReferenceData(), loadCurrentProfileData()]);
  if (!initial) {
    redirect("/login");
  }

  return (
    <PageContainer>
      <h1 className="mb-1 text-xl font-semibold">프로필을 완성해 주세요</h1>
      <p className="mb-5 text-sm text-[var(--color-muted-foreground)]">
        닉네임만 입력하면 바로 완료할 수 있어요. 나머지는 건너뛰었다가 나중에 마이 &gt; 프로필 수정에서 채워도 돼요.
      </p>
      <ProfileWizard mode="onboarding" reference={reference} initial={initial} />
    </PageContainer>
  );
}
