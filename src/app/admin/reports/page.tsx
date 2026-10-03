import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/PageContainer";
import { EmptyState } from "@/components/states";
import { ReportRow, type ReportItem } from "./ReportRow";

interface ReportRowFromDb {
  id: string;
  target_type: string;
  target_id: string;
  reason: string;
  description: string | null;
  status: string;
  created_at: string;
  profiles: { nickname: string } | null;
}

export default async function AdminReportsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reports")
    .select("id, target_type, target_id, reason, description, status, created_at, profiles:reporter_id(nickname)")
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<ReportRowFromDb[]>();

  const reports: ReportItem[] = (data ?? []).map((r) => ({
    id: r.id,
    target_type: r.target_type,
    target_id: r.target_id,
    reason: r.reason,
    description: r.description,
    status: r.status,
    created_at: r.created_at,
    reporter_nickname: r.profiles?.nickname ?? "알 수 없음",
  }));

  return (
    <PageContainer>
      <h1 className="mb-4 text-xl font-semibold">신고 관리</h1>
      {reports.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {reports.map((r) => (
            <ReportRow key={r.id} report={r} />
          ))}
        </ul>
      ) : (
        <EmptyState title="신고 내역이 없어요" />
      )}
    </PageContainer>
  );
}
