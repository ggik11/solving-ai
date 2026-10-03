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

export default async function AdminActivitiesPage() {
  const supabase = await createClient();
  const { data: activities } = await supabase
    .from("activities")
    .select("id, title, status, is_demo, apply_end_at")
    .order("created_at", { ascending: false });

  return (
    <PageContainer>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">활동 관리</h1>
        <Link href="/admin/activities/new" className="rounded-md bg-[var(--color-brand-600)] px-3 py-1.5 text-sm font-medium text-white">
          + 새 활동
        </Link>
      </div>

      {!activities || activities.length === 0 ? (
        <EmptyState title="등록된 활동이 없어요" />
      ) : (
        <ul className="flex flex-col gap-2">
          {activities.map((activity) => (
            <li
              key={activity.id}
              className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{activity.title}</span>
                <Badge variant={activity.status === "published" ? "success" : "neutral"}>
                  {STATUS_LABEL[activity.status as ActivityStatus]}
                </Badge>
              </div>
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
