"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveActivitySubmissionAction, rejectActivitySubmissionAction } from "./actions";
import { isHttpUrl } from "@/lib/url";
import { FieldPicker, type FieldPickerInterest } from "@/components/FieldPicker";
import { resolveSecondarySelection } from "@/lib/poster/fieldSelection";

export interface SubmissionAnalysisSummary {
  modelVersion: string;
  status: "suggested" | "needs_review" | "failed";
  topClass: string | null;
  topScore: number | null;
  failureReason: string | null;
  candidateInterestNames: string[];
}

export interface SubmissionItem {
  id: string;
  title: string;
  summary: string | null;
  org_name: string | null;
  source_url: string | null;
  created_at: string;
  submitter_nickname: string;
  /** 이 제보를 분석한 가장 최근 포스터 분석(없으면 분석하지 않았거나 모델이 없었던 경우). */
  analysis: SubmissionAnalysisSummary | null;
  /** 제보자가 "제안"한 분야(확정 아님) — 승인 화면의 기본 선택값으로만 쓴다. */
  proposedPrimaryInterestId: string | null;
  proposedSecondaryInterestIds: string[];
  /** 그 제안 중 제보자가 모델 후보 칩을 그대로 눌러서 고른 분야(수락률 통계용). */
  proposedAcceptedInterestIds: string[];
}

const STATUS_LABEL: Record<SubmissionAnalysisSummary["status"], string> = {
  suggested: "제안됨",
  needs_review: "확신 낮음",
  failed: "실패",
};

export function SubmissionRow({ submission, interests }: { submission: SubmissionItem; interests: FieldPickerInterest[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  // 관리자가 분야를 확정할 때 기본값으로 제보자의 제안을 미리 채워 둔다 — 그대로 둘지, 바꿀지는
  // 관리자가 결정한다(가이드: "제보자는 제안만, 확정은 관리자가").
  const [primary, setPrimary] = useState(submission.proposedPrimaryInterestId ?? "");
  const [secondary, setSecondary] = useState<string[]>(submission.proposedSecondaryInterestIds);
  // 제보자가 모델 후보를 그대로 제안한 분야 — 관리자가 바꾸지 않고 그대로 승인하면 수락으로
  // 기록한다. 관리자가 select/토글로 값을 바꾸면 그 분야는 이 집합에서 빠진다(아래 핸들러).
  const [acceptedSet, setAcceptedSet] = useState<string[]>(submission.proposedAcceptedInterestIds);

  function handlePrimaryChange(id: string) {
    setAcceptedSet((prev) => prev.filter((x) => x !== primary));
    setPrimary(id);
  }

  function handleToggleSecondary(id: string) {
    setSecondary((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setAcceptedSet((prev) => prev.filter((x) => x !== id));
  }

  function handleApprove() {
    setError(null);
    const resolvedSecondary = resolveSecondarySelection(primary || null, secondary);
    startTransition(async () => {
      const result = await approveActivitySubmissionAction(submission.id, {
        primaryInterestId: primary || null,
        secondaryInterestIds: resolvedSecondary,
        acceptedCandidateInterestIds: acceptedSet,
      });
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
      {isHttpUrl(submission.source_url) && (
        <a href={submission.source_url} target="_blank" rel="noreferrer" className="text-xs text-[var(--color-brand-700)] underline">
          원문 링크 ↗
        </a>
      )}

      {submission.analysis && (
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--background)] p-2 text-xs text-[var(--color-muted-foreground)]">
          <p>
            포스터 분석: 모델 {submission.analysis.modelVersion} · {STATUS_LABEL[submission.analysis.status]}
            {submission.analysis.topClass && ` · 1위 ${submission.analysis.topClass}`}
            {submission.analysis.topScore != null && ` (${Math.round(submission.analysis.topScore * 100)}%)`}
            {submission.analysis.failureReason && ` (${submission.analysis.failureReason})`}
          </p>
          {submission.analysis.candidateInterestNames.length > 0 && (
            <p>모델 후보 분야: {submission.analysis.candidateInterestNames.join(", ")}</p>
          )}
        </div>
      )}
      {(submission.proposedPrimaryInterestId || submission.proposedSecondaryInterestIds.length > 0) && (
        <p className="text-xs text-[var(--color-muted-foreground)]">제보자 제안 분야가 아래 기본값으로 채워져 있어요 — 확정은 승인 시 관리자가 해요.</p>
      )}

      <FieldPicker
        interests={interests}
        primary={primary}
        onPrimaryChange={handlePrimaryChange}
        secondary={secondary}
        onToggleSecondary={handleToggleSecondary}
        primaryLabel="대표 분야 확정"
        secondaryLabel="부가 분야 확정 (복수 선택)"
      />

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="거절 사유 (선택)"
          aria-label="거절 사유"
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
