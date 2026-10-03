import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/PageContainer";
import { EmptyState } from "@/components/states";
import { formatKst } from "@/lib/format";

interface AuditLogRow {
  id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  profiles: { nickname: string } | null;
}

const ACTION_LABEL: Record<string, string> = {
  report_status_changed: "신고 상태 변경",
  view_reported_message_context: "신고된 메시지 열람",
  account_suspended: "계정 정지",
  account_unsuspended: "계정 정지 해제",
  activity_submission_approved: "활동 제보 승인",
  activity_submission_rejected: "활동 제보 거절",
};

export default async function AdminAuditLogsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("audit_logs")
    .select("id, action, target_type, target_id, metadata, created_at, profiles:actor_id(nickname)")
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<AuditLogRow[]>();

  const logs = data ?? [];

  return (
    <PageContainer>
      <h1 className="mb-4 text-xl font-semibold">감사 로그</h1>
      {logs.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {logs.map((log) => (
            <li key={log.id} className="flex flex-col gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{ACTION_LABEL[log.action] ?? log.action}</span>
                <span className="text-xs text-[var(--color-muted-foreground)]">{formatKst(log.created_at)}</span>
              </div>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                실행자: {log.profiles?.nickname ?? "시스템"}
                {log.target_type && ` · 대상: ${log.target_type}${log.target_id ? ` (${log.target_id.slice(0, 8)}…)` : ""}`}
              </p>
              {log.metadata && (
                <pre className="overflow-x-auto rounded bg-[var(--color-surface-muted)] p-2 text-[11px]">
                  {JSON.stringify(log.metadata)}
                </pre>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="감사 로그가 없어요" />
      )}
    </PageContainer>
  );
}
