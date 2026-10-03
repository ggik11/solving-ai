"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveActivitySubmissionAction, rejectActivitySubmissionAction } from "./actions";

export interface SubmissionItem {
  id: string;
  title: string;
  summary: string | null;
  org_name: string | null;
  source_url: string | null;
  created_at: string;
  submitter_nickname: string;
}

export function SubmissionRow({ submission }: { submission: SubmissionItem }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      const result = await approveActivitySubmissionAction(submission.id);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  function handleReject() {
    setError(null);
    startTransition(async () => {
      const result = await rejectActivitySubmissionAction(submission.id, note);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">
      <p className="font-medium">{submission.title}</p>
      {submission.summary && <p className="text-xs text-[var(--color-muted-foreground)]">{submission.summary}</p>}
      <p className="text-xs text-[var(--color-muted-foreground)]">
        제보자: {submission.submitter_nickname}
        {submission.org_name && ` · 주최: ${submission.org_name}`}
      </p>
      {submission.source_url && (
        <a href={submission.source_url} target="_blank" rel="noreferrer" className="text-xs text-[var(--color-brand-700)] underline">
          원문 링크 ↗
        </a>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="거절 사유 (선택)"
          className="min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--background)] px-2 py-1.5 text-xs"
        />
        <button
          type="button"
          disabled={isPending}
          onClick={handleApprove}
          className="rounded-md bg-[var(--color-brand-600)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
        >
          승인(공개)
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={handleReject}
          className="rounded-md border border-[var(--color-danger)]/40 px-3 py-1.5 text-xs font-medium text-[var(--color-danger)] disabled:opacity-60"
        >
          거절
        </button>
      </div>
      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
    </li>
  );
}
