"use client";

import { useState, useTransition } from "react";
import { createReportAction } from "@/app/report/actions";
import { REPORT_REASON_LABEL } from "@/lib/reports";

const REASONS = Object.keys(REPORT_REASON_LABEL);

export function ReportButton({
  targetType,
  targetId,
  label = "신고",
}: {
  targetType: "profile" | "party" | "chat_message" | "activity";
  targetId: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]!);
  const [description, setDescription] = useState("");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  function handleSubmit() {
    startTransition(async () => {
      const res = await createReportAction(targetType, targetId, reason, description);
      if (res.ok) {
        setResult({ ok: true, message: "신고가 접수되었어요." });
        setDescription("");
        setTimeout(() => setOpen(false), 1200);
      } else {
        setResult({ ok: false, message: res.error });
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setResult(null);
        }}
        className="text-xs text-[var(--color-muted-foreground)] underline"
      >
        {label}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs">
      <select
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        aria-label="신고 사유"
        className="rounded-md border border-[var(--color-border)] bg-[var(--background)] px-2 py-1.5"
      >
        {REASONS.map((r) => (
          <option key={r} value={r}>
            {REPORT_REASON_LABEL[r]}
          </option>
        ))}
      </select>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="자세한 설명 (선택)"
        aria-label="신고 설명"
        rows={2}
        className="rounded-md border border-[var(--color-border)] bg-[var(--background)] px-2 py-1.5"
      />
      {result && (
        <p className={result.ok ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}>{result.message}</p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={handleSubmit}
          className="rounded-md bg-[var(--color-danger)] px-3 py-1.5 font-medium text-white disabled:opacity-60"
        >
          신고 제출
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-[var(--color-border)] px-3 py-1.5">
          취소
        </button>
      </div>
    </div>
  );
}
