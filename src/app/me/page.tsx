import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserAndProfile, isCurrentUserAdmin } from "@/lib/auth";
import { PageContainer } from "@/components/PageContainer";
import { Badge } from "@/components/Badge";
import { SignOutButton } from "@/components/SignOutButton";
import type { ActivityWithType } from "@/lib/supabase/types";

const CAMPUS_VERIFIED_LABEL: Record<"true" | "false", string> = {
  true: "소속 확인됨",
  false: "자기기입 (미검증)",
};

export default async function MePage() {
  const { supabase, user, profile } = await getCurrentUserAndProfile();

  if (!user) {
    redirect("/login");
  }
  if (!profile?.onboarding_completed_at) {
    redirect("/onboarding");
  }

  const isAdmin = await isCurrentUserAdmin();

  const { count: unreadNotificationCount } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", user.id)
    .is("read_at", null);

  const { data: bookmarks } = await supabase
    .from("bookmarks")
    .select("activity_id, activities(id, title, apply_end_at)")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false })
    .limit(5)
    .returns<{ activity_id: string; activities: Pick<ActivityWithType, "id" | "title" | "apply_end_at"> | null }[]>();

  return (
    <PageContainer>
      <h1 className="mb-4 text-xl font-semibold">마이</h1>

      <section className="mb-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-lg font-semibold">{profile.nickname}</span>
          <Badge variant={profile.campus_verified ? "success" : "neutral"}>
            {CAMPUS_VERIFIED_LABEL[String(profile.campus_verified) as "true" | "false"]}
          </Badge>
        </div>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          {profile.university} · {profile.campus}캠퍼스
          {profile.grade ? ` · ${profile.grade}학년` : ""}
        </p>
        {profile.bio && <p className="mt-2 text-sm">{profile.bio}</p>}
        <Link
          href="/me/edit"
          className="mt-3 inline-block rounded-md border border-[var(--color-brand-300)] px-4 py-2 text-sm font-medium text-[var(--color-brand-700)]"
        >
          프로필 수정
        </Link>
      </section>

      <section className="mb-6 flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-[var(--color-muted-foreground)]">북마크</h2>
        {bookmarks && bookmarks.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {bookmarks
              .filter((b) => b.activities)
              .map((b) => (
                <li key={b.activity_id}>
                  <Link
                    href={`/activities/${b.activity_id}`}
                    className="block rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm"
                  >
                    {b.activities!.title}
                  </Link>
                </li>
              ))}
          </ul>
        ) : (
          <p className="rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-muted-foreground)]">
            아직 북마크한 활동이 없어요.
          </p>
        )}
        <p className="rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-muted-foreground)]">
          빠른 매칭 이력 (준비 중, 4단계)
        </p>
        <Link
          href="/parties"
          className="rounded-md border border-[var(--color-brand-300)] bg-[var(--color-brand-50)] px-4 py-3 text-sm font-medium text-[var(--color-brand-700)]"
        >
          내 파티 보기
        </Link>
        <Link
          href="/notifications"
          className="flex items-center justify-between rounded-md border border-[var(--color-brand-300)] bg-[var(--color-brand-50)] px-4 py-3 text-sm font-medium text-[var(--color-brand-700)]"
        >
          알림
          {(unreadNotificationCount ?? 0) > 0 && <Badge variant="danger">{unreadNotificationCount}</Badge>}
        </Link>
        {isAdmin && (
          <Link
            href="/admin"
            className="rounded-md border border-[var(--color-brand-300)] bg-[var(--color-brand-50)] px-4 py-3 text-sm font-medium text-[var(--color-brand-700)]"
          >
            관리자 화면으로 이동
          </Link>
        )}
      </section>

      <SignOutButton />
    </PageContainer>
  );
}
