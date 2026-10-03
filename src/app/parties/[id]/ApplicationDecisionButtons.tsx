"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveApplicationAction, rejectApplicationAction } from "../actions";

export function ApplicationDecisionButtons({ applicationId, partyId }: { applicationId: string; partyId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handle(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => handle(() => approveApplicationAction(applicationId, partyId))}
          className="rounded-md bg-[var(--color-brand-600)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
        >
          승인
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => handle(() => rejectApplicationAction(applicationId, partyId))}
          className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium disabled:opacity-60"
        >
          거절
        </button>
      </div>
      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
    </div>
  );
}
