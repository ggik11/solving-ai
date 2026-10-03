"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/Badge";
import { formatKst } from "@/lib/format";
import { REPORT_REASON_LABEL, REPORT_STATUS_LABEL, REPORT_TARGET_TYPE_LABEL, reportStatusBadgeVariant } from "@/lib/reports";
import {
  updateReportStatusAction,
  viewReportedMessageContextAction,
  type ReportedMessageContextRow,
} from "./actions";

export interface ReportItem {
  id: string;
  target_type: string;
  target_id: string;
  reason: string;
  description: string | null;
  status: string;
  created_at: string;
  reporter_nickname: string;
}

const STATUSES = ["open", "reviewing", "resolved", "dismissed"] as const;

export function ReportRow({ report }: { report: ReportItem }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<ReportedMessageContextRow[] | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);

  function handleStatusChange(status: (typeof STATUSES)[number]) {
    setError(null);
    startTransition(async () => {
      const result = await updateReportStatusAction(report.id, status, note);
      if (!result.ok) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  function handleViewMessage() {
    setContextError(null);
    startTransition(async () => {
      const result = await viewReportedMessageContextAction(report.id);
      if (result.ok) {
        setContext(result.messages);
      } else {
        setContextError(result.error);
      }
    });
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">
          {REPORT_TARGET_TYPE_LABEL[report.target_type] ?? report.target_type} 신고 · {REPORT_REASON_LABEL[report.reason] ?? report.reason}
        </span>
        <Badge variant={reportStatusBadgeVariant(report.status)}>{REPORT_STATUS_LABEL[report.status] ?? report.status}</Badge>
      </div>
      <p className="text-xs text-[var(--color-muted-foreground)]">
        신고자: {report.reporter_nickname} · {formatKst(report.created_at)}
      </p>
      {report.description && <p className="whitespace-pre-wrap">{report.description}</p>}

      {report.target_type === "chat_message" && (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            disabled={isPending}
            onClick={handleViewMessage}
            className="self-start rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium disabled:opacity-60"
          >
            신고된 메시지 보기 (전후 3개)
          </button>
          {contextError && <p className="text-xs text-[var(--color-danger)]">{contextError}</p>}
          {context && (
            <ul className="flex flex-col gap-1 rounded-md border border-dashed border-[var(--color-border)] p-2">
              {context.map((m) => (
                <li
                  key={m.id}
                  className={`text-xs ${m.is_reported_message ? "rounded bg-[var(--color-danger-bg)] px-1.5 py-1 font-medium" : "text-[var(--color-muted-foreground)]"}`}
                >
                  {m.sender_nickname}: {m.body}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="처리 메모 (선택)"
          className="min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--background)] px-2 py-1.5 text-xs"
        />
        {STATUSES.filter((s) => s !== report.status).map((s) => (
          <button
            key={s}
            type="button"
            disabled={isPending}
            onClick={() => handleStatusChange(s)}
            className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium disabled:opacity-60"
          >
            {REPORT_STATUS_LABEL[s]}로 변경
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
    </li>
  );
}
