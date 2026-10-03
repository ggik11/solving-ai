import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/PageContainer";
import { EmptyState, ErrorRetry } from "@/components/states";
import { Badge } from "@/components/Badge";
import { Pagination } from "@/components/Pagination";
import { formatKst, getApplyPhase, APPLY_PHASE_LABEL } from "@/lib/format";
import { ActivityFilterForm } from "./ActivityFilterForm";
import { parseFilters, filtersToSearchParams, queryActivities, PAGE_SIZE } from "./queries";

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const filters = parseFilters(resolvedSearchParams);

  const supabase = await createClient();
  const [{ data: activityTypes }, result, { data: userData }] = await Promise.all([
    supabase.from("activity_types").select("id, name").order("name"),
    queryActivities(supabase, filters),
    supabase.auth.getUser(),
  ]);

  const totalPages = Math.max(1, Math.ceil(result.count / PAGE_SIZE));

  return (
    <PageContainer>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">활동 탐색</h1>
        {userData.user && (
          <Link href="/activities/submit" className="text-sm text-[var(--color-brand-700)] underline">
            활동 제보하기
          </Link>
        )}
      </div>
      <ActivityFilterForm filters={filters} activityTypes={activityTypes ?? []} />

      {result.error ? (
        <ErrorRetry message="활동을 불러오지 못했습니다." retryHref="/activities" />
      ) : result.data.length === 0 ? (
        <EmptyState title="조건에 맞는 활동이 없어요" description="필터를 조정해 보세요." />
      ) : (
        <>
          <p className="mb-2 text-xs text-[var(--color-muted-foreground)]">총 {result.count}건</p>
          <ul className="flex flex-col gap-2">
            {result.data.map((activity) => {
              const phase = getApplyPhase(activity.apply_start_at, activity.apply_end_at);
              return (
                <li key={activity.id}>
                  <Link
                    href={`/activities/${activity.id}`}
                    className="flex flex-col gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{activity.title}</span>
                      {activity.is_demo && <Badge variant="neutral">데모</Badge>}
                    </div>
                    {activity.summary && (
                      <p className="text-sm text-[var(--color-muted-foreground)]">{activity.summary}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-muted-foreground)]">
                      <Badge variant={phase === "closing_soon" ? "warning" : phase === "closed" ? "neutral" : "info"}>
                        {APPLY_PHASE_LABEL[phase]}
                      </Badge>
                      {activity.activity_types?.name && <Badge variant="neutral">{activity.activity_types.name}</Badge>}
                      <span>{activity.region ?? "지역 미정"}</span>
                      <span>마감 {formatKst(activity.apply_end_at)}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          <Pagination
            page={filters.page}
            totalPages={totalPages}
            buildHref={(page) => `/activities?${filtersToSearchParams(filters, { page })}`}
          />
        </>
      )}
    </PageContainer>
  );
}
