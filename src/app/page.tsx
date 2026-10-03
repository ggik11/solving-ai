import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/auth";
import { PageContainer } from "@/components/PageContainer";
import { EmptyState } from "@/components/states";
import { Badge } from "@/components/Badge";
import { formatKst, getApplyPhase, APPLY_PHASE_LABEL } from "@/lib/format";
import type { ActivityWithType } from "@/lib/supabase/types";

export default async function HomePage() {
  const { supabase, user, profile } = await getCurrentUserAndProfile();

  if (user && !profile?.onboarding_completed_at) {
    redirect("/onboarding");
  }

  const { data: closingSoon } = await supabase
    .from("activities")
    .select("id, title, apply_start_at, apply_end_at, is_demo, activity_types(id, name)")
    .eq("status", "published")
    .order("apply_end_at", { ascending: true })
    .limit(5)
    .returns<ActivityWithType[]>();

  return (
    <PageContainer>
      <header className="mb-6">
        <p className="text-sm text-[var(--color-muted-foreground)]">상명메이트 (비공식 데모)</p>
        <h1 className="text-xl font-semibold">
          {user ? `${profile?.nickname ?? "회원"}님, 안녕하세요` : "대외활동을 같이할 팀을 찾아보세요"}
        </h1>
        {!user && (
          <Link
            href="/login"
            className="mt-3 inline-block rounded-md bg-[var(--color-brand-600)] px-4 py-2 text-sm font-medium text-white"
          >
            로그인
          </Link>
        )}
      </header>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-muted-foreground)]">맞춤 추천</h2>
        <EmptyState title="맞춤 추천은 3단계에서 제공돼요" description="관심분야·가능 시간을 바탕으로 한 추천 계산은 다음 단계에서 구현합니다." />
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-muted-foreground)]">마감임박 활동</h2>
        {closingSoon && closingSoon.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {closingSoon.map((activity) => {
              const phase = getApplyPhase(activity.apply_start_at, activity.apply_end_at);
              return (
                <li key={activity.id}>
                  <Link
                    href={`/activities/${activity.id}`}
                    className="flex flex-col gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{activity.title}</span>
                      {activity.is_demo && <Badge variant="neutral">데모</Badge>}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
                      <Badge variant={phase === "closing_soon" ? "warning" : "info"}>{APPLY_PHASE_LABEL[phase]}</Badge>
                      <span>마감 {formatKst(activity.apply_end_at)}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title="표시할 활동이 없어요" />
        )}
        <Link href="/activities" className="mt-2 inline-block text-sm text-[var(--color-brand-700)] underline">
          전체 활동 보기
        </Link>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-muted-foreground)]">모집 중인 파티 · 내 매칭 상태</h2>
        <EmptyState title="파티·매칭 기능은 준비 중이에요" description="팀 모집과 빠른 매칭은 3~4단계에서 구현됩니다." />
      </section>
    </PageContainer>
  );
}
