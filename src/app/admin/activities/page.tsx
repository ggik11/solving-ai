import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/PageContainer";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/states";
import { formatKst } from "@/lib/format";
import { setActivityStatusAction } from "./actions";
import type { ActivityStatus } from "@/lib/supabase/types";

const STATUS_LABEL: Record<ActivityStatus, string> = {
  draft: "비공개",
  published: "공개중",
  closed: "마감",
  archived: "보관",
};

type FieldFilter = "all" | "unconfirmed" | "model_pending";

const FIELD_FILTER_LABEL: Record<FieldFilter, string> = {
  all: "전체",
  unconfirmed: "분야 미확정",
  model_pending: "모델 후보 대기",
};

export default async function AdminActivitiesPage({ searchParams }: { searchParams: Promise<{ field?: string }> }) {
  const { field } = await searchParams;
  const fieldFilter: FieldFilter = field === "unconfirmed" || field === "model_pending" ? field : "all";

  const supabase = await createClient();
  const [{ data: activities }, { data: confirmedFieldRows }, { data: analyzedRows }] = await Promise.all([
    supabase
      .from("activities")
      .select("id, title, status, is_demo, apply_end_at, needs_verification, verification_note")
      .order("created_at", { ascending: false }),
    supabase.from("activity_fields").select("activity_id"),
    supabase.from("poster_analyses").select("activity_id").not("activity_id", "is", null),
  ]);

  // 가이드 5.6: "분야 미확정"(activity_fields가 전혀 없음) / "모델 후보 대기"(모델이 분석은 했지만
  // 아직 분야가 확정되지 않음) 필터. 행 수가 적어 서버에서 집합 연산으로 거른다 — 전용 쿼리/뷰는
  // 필요해지면 추가한다.
  const confirmedIds = new Set((confirmedFieldRows ?? []).map((r) => r.activity_id as string));
  const analyzedIds = new Set((analyzedRows ?? []).map((r) => r.activity_id as string));
  const filteredActivities = (activities ?? []).filter((a) => {
    if (fieldFilter === "unconfirmed") return !confirmedIds.has(a.id);
    if (fieldFilter === "model_pending") return !confirmedIds.has(a.id) && analyzedIds.has(a.id);
    return true;
  });

  return (
    <PageContainer>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">활동 관리</h1>
        <Link href="/admin/activities/new" className="rounded-md bg-[var(--color-brand-600)] px-3 py-1.5 text-sm font-medium text-white">
          + 새 활동
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(FIELD_FILTER_LABEL) as FieldFilter[]).map((key) => (
          <Link
            key={key}
            href={key === "all" ? "/admin/activities" : `/admin/activities?field=${key}`}
            className={`rounded-full border px-3 py-1 text-xs ${
              fieldFilter === key
                ? "border-[var(--color-brand-600)] bg-[var(--color-brand-600)] text-white"
                : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--foreground)]"
            }`}
          >
            {FIELD_FILTER_LABEL[key]}
          </Link>
        ))}
      </div>

      {filteredActivities.length === 0 ? (
        <EmptyState title="해당하는 활동이 없어요" />
      ) : (
        <ul className="flex flex-col gap-2">
          {filteredActivities.map((activity) => (
            <li
              key={activity.id}
              className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{activity.title}</span>
                <div className="flex items-center gap-2">
                  {activity.needs_verification && <Badge variant="danger">원문 확인 필요</Badge>}
                  <Badge variant={activity.status === "published" ? "success" : "neutral"}>
                    {STATUS_LABEL[activity.status as ActivityStatus]}
                  </Badge>
                </div>
              </div>
              {activity.needs_verification && activity.verification_note && (
                <p className="text-xs text-[var(--color-danger)]">정기 점검: {activity.verification_note}</p>
              )}
              <p className="text-xs text-[var(--color-muted-foreground)]">마감 {formatKst(activity.apply_end_at)}</p>
              <div className="flex flex-wrap gap-2 text-sm">
                <Link href={`/admin/activities/${activity.id}/edit`} className="rounded-md border border-[var(--color-border)] px-3 py-1.5">
                  수정
                </Link>
                {activity.status === "published" ? (
                  <form action={setActivityStatusAction.bind(null, activity.id, "draft")}>
                    <button type="submit" className="rounded-md border border-[var(--color-border)] px-3 py-1.5">
                      비공개로 전환
                    </button>
                  </form>
                ) : (
                  <form action={setActivityStatusAction.bind(null, activity.id, "published")}>
                    <button type="submit" className="rounded-md border border-[var(--color-brand-300)] px-3 py-1.5 text-[var(--color-brand-700)]">
                      공개로 전환
                    </button>
                  </form>
                )}
                {activity.status !== "closed" && (
                  <form action={setActivityStatusAction.bind(null, activity.id, "closed")}>
                    <button type="submit" className="rounded-md border border-[var(--color-border)] px-3 py-1.5">
                      마감 처리
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
