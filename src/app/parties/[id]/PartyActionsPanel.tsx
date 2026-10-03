"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  applyToPartyAction,
  cancelApplicationAction,
  confirmPartyAction,
  delegateLeaderAction,
  disbandPartyAction,
  leavePartyAction,
  reopenPartyAction,
} from "../actions";

interface OtherMember {
  profileId: string;
  nickname: string;
}

export function PartyActionsPanel({
  partyId,
  status,
  isLeader,
  isMember,
  myPendingApplicationId,
  otherActiveMembers,
}: {
  partyId: string;
  status: string;
  isLeader: boolean;
  isMember: boolean;
  myPendingApplicationId: string | null;
  otherActiveMembers: OtherMember[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [applyMessage, setApplyMessage] = useState("");
  const [showApplyForm, setShowApplyForm] = useState(false);
  const [delegateTarget, setDelegateTarget] = useState("");

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="rounded-md bg-[var(--color-danger-bg)] px-3 py-2 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      {/* 비멤버: 모집 중일 때 지원 */}
      {!isMember && !myPendingApplicationId && status === "recruiting" && (
        <div className="flex flex-col gap-2">
          {showApplyForm ? (
            <>
              <textarea
                value={applyMessage}
                onChange={(e) => setApplyMessage(e.target.value)}
                placeholder="팀장에게 보낼 메시지 (선택)"
                rows={3}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={isPending}
                onClick={() => run(() => applyToPartyAction(partyId, applyMessage))}
                className="rounded-md bg-[var(--color-brand-600)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
              >
                지원하기
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setShowApplyForm(true)}
              className="rounded-md bg-[var(--color-brand-600)] px-4 py-2.5 text-sm font-medium text-white"
            >
              이 파티에 지원하기
            </button>
          )}
        </div>
      )}

      {/* 지원 대기 중인 비멤버 */}
      {myPendingApplicationId && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(() => cancelApplicationAction(myPendingApplicationId, partyId))}
          className="rounded-md border border-[var(--color-border)] px-4 py-2.5 text-sm font-medium disabled:opacity-60"
        >
          지원 취소
        </button>
      )}

      {/* 멤버(팀장 제외): 탈퇴 */}
      {isMember && !isLeader && (status === "recruiting" || status === "full" || status === "confirmed") && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(() => leavePartyAction(partyId), "정말 이 파티에서 탈퇴할까요?")}
          className="rounded-md border border-[var(--color-border)] px-4 py-2.5 text-sm font-medium disabled:opacity-60"
        >
          파티 탈퇴
        </button>
      )}

      {/* 팀장 전용 액션 */}
      {isLeader && (
        <div className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <p className="text-xs font-semibold text-[var(--color-muted-foreground)]">팀장 메뉴</p>

          {(status === "recruiting" || status === "full") && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(() => confirmPartyAction(partyId), "지금 팀을 확정할까요? 확정 후에는 지원을 받지 않아요.")}
              className="rounded-md bg-[var(--color-brand-600)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
            >
              팀 확정하기
            </button>
          )}

          {status === "full" && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(() => reopenPartyAction(partyId))}
              className="rounded-md border border-[var(--color-border)] px-4 py-2.5 text-sm font-medium disabled:opacity-60"
            >
              재모집 시작 (모집 중으로 전환)
            </button>
          )}

          {otherActiveMembers.length > 0 && (status === "recruiting" || status === "full" || status === "confirmed") && (
            <div className="flex items-center gap-2">
              <select
                value={delegateTarget}
                onChange={(e) => setDelegateTarget(e.target.value)}
                className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
              >
                <option value="">팀장 위임할 멤버 선택</option>
                {otherActiveMembers.map((m) => (
                  <option key={m.profileId} value={m.profileId}>
                    {m.nickname}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={isPending || !delegateTarget}
                onClick={() => run(() => delegateLeaderAction(partyId, delegateTarget), "팀장을 위임할까요?")}
                className="shrink-0 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-medium disabled:opacity-60"
              >
                위임
              </button>
            </div>
          )}

          {otherActiveMembers.length === 0 && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(() => leavePartyAction(partyId), "혼자 남은 팀장이 탈퇴하면 파티가 해산돼요. 계속할까요?")}
              className="rounded-md border border-[var(--color-border)] px-4 py-2.5 text-sm font-medium disabled:opacity-60"
            >
              파티 탈퇴 (자동 해산)
            </button>
          )}

          {status !== "cancelled" && status !== "completed" && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(() => disbandPartyAction(partyId), "정말 파티를 해산할까요? 되돌릴 수 없어요.")}
              className="rounded-md border border-[var(--color-danger)]/40 px-4 py-2.5 text-sm font-medium text-[var(--color-danger)] disabled:opacity-60"
            >
              파티 해산
            </button>
          )}
        </div>
      )}
    </div>
  );
}
