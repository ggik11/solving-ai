"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { blockUserAction, unblockUserAction } from "@/app/me/blocked/actions";

export function BlockToggleButton({
  profileId,
  initialBlocked,
}: {
  profileId: string;
  initialBlocked: boolean;
}) {
  const router = useRouter();
  const [blocked, setBlocked] = useState(initialBlocked);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    const confirmText = blocked ? "차단을 해제할까요?" : "이 사용자를 차단할까요? 서로 새 파티 추천·매칭에서 제외돼요.";
    if (!window.confirm(confirmText)) return;

    setError(null);
    startTransition(async () => {
      const result = blocked ? await unblockUserAction(profileId) : await blockUserAction(profileId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setBlocked(!blocked);
      router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className={`rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-60 ${
          blocked
            ? "border-[var(--color-border)] text-[var(--color-muted-foreground)]"
            : "border-[var(--color-danger)]/40 text-[var(--color-danger)]"
        }`}
      >
        {blocked ? "차단 해제" : "차단하기"}
      </button>
      {error && <span className="text-[11px] text-[var(--color-danger)]">{error}</span>}
    </span>
  );
}
