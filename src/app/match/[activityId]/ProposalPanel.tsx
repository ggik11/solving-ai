"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { respondToMatchProposalAction } from "./actions";
import { formatKst } from "@/lib/format";

export interface ProposalMemberView {
  profileId: string;
  nickname: string;
  roleName: string;
  isProposedLeader: boolean;
  response: "pending" | "accepted" | "declined";
}

export function ProposalPanel({
  activityId,
  proposalId,
  members,
  commonMinutes,
  expiresAt,
  myResponse,
}: {
  activityId: string;
  proposalId: string;
  members: ProposalMemberView[];
  commonMinutes: number | null;
  expiresAt: string;
  myResponse: "pending" | "accepted" | "declined";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function respond(accept: boolean) {
    if (accept && !window.confirm("이 팀 제안을 수락할까요?")) return;
    if (!accept && !window.confirm("이 팀 제안을 거절할까요? 되돌릴 수 없어요.")) return;
    setError(null);
    startTransition(async () => {
      const result = await respondToMatchProposalAction(proposalId, accept, activityId);
      if (!result.ok) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  const hours = commonMinutes != null ? Math.round((commonMinutes / 60) * 10) / 10 : null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm">
      <p className="font-medium">팀 제안이 도착했어요</p>

      <ul className="flex flex-col gap-1.5">
        {members.map((m) => (
          <li key={m.profileId} className="flex items-center justify-between rounded-md border border-[var(--color-border)] px-3 py-2">
            <span>
              {m.nickname}
              <span className="ml-1.5 text-xs text-[var(--color-muted-foreground)]">{m.roleName}</span>
              {m.isProposedLeader && <span className="ml-1.5 text-xs text-[var(--color-brand-700)]">팀장 후보</span>}
            </span>
            <span className="text-xs text-[var(--color-muted-foreground)]">
              {m.response === "accepted" ? "수락함" : m.response === "declined" ? "거절함" : "응답 대기"}
            </span>
          </li>
        ))}
      </ul>

      <p className="text-[var(--color-muted-foreground)]">
        전체 공통 가능 시간: {hours != null ? `주당 약 ${hours}시간` : "계산 중"}
      </p>
      <p className="text-[var(--color-muted-foreground)]">수락 기한: {formatKst(expiresAt)}</p>

      {error && (
        <p role="alert" className="text-[var(--color-danger)]">
          {error}
        </p>
      )}

      {myResponse === "pending" ? (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => respond(true)}
            className="flex-1 rounded-md bg-[var(--color-brand-600)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
          >
            수락
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => respond(false)}
            className="flex-1 rounded-md border border-[var(--color-danger)]/40 px-4 py-2.5 text-sm font-medium text-[var(--color-danger)] disabled:opacity-60"
          >
            거절
          </button>
        </div>
      ) : (
        <p className="font-medium">이미 {myResponse === "accepted" ? "수락" : "거절"}했어요. 다른 팀원의 응답을 기다리는 중이에요.</p>
      )}
    </div>
  );
}
