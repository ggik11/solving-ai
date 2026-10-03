"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/Badge";
import { ACCOUNT_STATUS_LABEL } from "@/lib/reports";
import { suspendAccountAction, unsuspendAccountAction } from "./actions";

export interface AccountItem {
  id: string;
  nickname: string;
  account_status: string;
}

export function AccountRow({ account }: { account: AccountItem }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSuspend() {
    if (!window.confirm(`${account.nickname}님의 계정을 정지할까요?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await suspendAccountAction(account.id, reason);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  function handleUnsuspend() {
    setError(null);
    startTransition(async () => {
      const result = await unsuspendAccountAction(account.id);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{account.nickname}</span>
        <Badge variant={account.account_status === "active" ? "success" : account.account_status === "suspended" ? "danger" : "neutral"}>
          {ACCOUNT_STATUS_LABEL[account.account_status] ?? account.account_status}
        </Badge>
      </div>

      {account.account_status === "active" && (
        <div className="flex items-center gap-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="정지 사유 (선택)"
            className="min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--background)] px-2 py-1.5 text-xs"
          />
          <button
            type="button"
            disabled={isPending}
            onClick={handleSuspend}
            className="shrink-0 rounded-md border border-[var(--color-danger)]/40 px-3 py-1.5 text-xs font-medium text-[var(--color-danger)] disabled:opacity-60"
          >
            정지
          </button>
        </div>
      )}
      {account.account_status === "suspended" && (
        <button
          type="button"
          disabled={isPending}
          onClick={handleUnsuspend}
          className="self-start rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium disabled:opacity-60"
        >
          정지 해제
        </button>
      )}
      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
    </li>
  );
}
