"use client";

import { useState, useTransition } from "react";
import { withdrawAccountAction } from "./actions";

export function WithdrawForm() {
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (!confirmed) return;
    if (!window.confirm("정말 탈퇴할까요? 되돌릴 수 없어요.")) return;
    setError(null);
    startTransition(async () => {
      const result = await withdrawAccountAction();
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="rounded-md bg-[var(--color-danger-bg)] px-3 py-2 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
        위 내용을 모두 확인했고, 탈퇴에 동의합니다.
      </label>
      <button
        type="button"
        disabled={!confirmed || isPending}
        onClick={handleSubmit}
        className="rounded-md bg-[var(--color-danger)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
      >
        회원 탈퇴
      </button>
    </div>
  );
}
