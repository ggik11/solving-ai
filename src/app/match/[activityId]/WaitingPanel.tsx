"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelMatchingQueueAction } from "./actions";

export function WaitingPanel({
  activityId,
  queueId,
  waitingCount,
  missingRoles,
}: {
  activityId: string;
  queueId: string;
  waitingCount: number;
  missingRoles: string[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleCancel() {
    if (!window.confirm("매칭 대기를 취소할까요?")) return;
    setError(null);
    startTransition(async () => {
      const result = await cancelMatchingQueueAction(queueId, activityId);
      if (!result.ok) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm">
      <p className="font-medium">매칭 대기 중이에요</p>
      <p>현재 대기 중인 인원: {waitingCount}명</p>
      {missingRoles.length > 0 ? (
        <p className="text-[var(--color-muted-foreground)]">부족한 역할: {missingRoles.join(", ")}</p>
      ) : (
        <p className="text-[var(--color-muted-foreground)]">역할은 모두 지원자가 있어요. 공통 시간이 맞는지 계속 확인 중이에요.</p>
      )}

      {error && (
        <p role="alert" className="text-[var(--color-danger)]">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={isPending}
        onClick={handleCancel}
        className="self-start rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-medium disabled:opacity-60"
      >
        대기 취소
      </button>

      <Link href={`/parties/new?activity=${activityId}`} className="text-sm text-[var(--color-brand-700)] underline">
        대신 수동으로 파티 만들기
      </Link>
      <Link href={`/activities/${activityId}`} className="text-sm text-[var(--color-brand-700)] underline">
        이 활동의 다른 파티 보러 가기
      </Link>
    </div>
  );
}
