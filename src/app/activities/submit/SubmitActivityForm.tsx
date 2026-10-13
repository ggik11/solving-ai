"use client";

import { useState } from "react";
import { submitActivityAction } from "./actions";
import { previewActivitySubmissionUrlAction } from "./import-url-actions";
import { UrlImportPanel, type UrlImportApplyAction } from "@/components/UrlImportPanel";
import { PosterClassifierPanel, type InterestLabel } from "@/components/PosterClassifierPanel";
import { FieldPicker } from "@/components/FieldPicker";
import { applyCandidateSelection, resolveSecondarySelection } from "@/lib/poster/fieldSelection";
import { toPendingPosterAnalysis, type PosterAnalysisResult } from "@/lib/poster/analyze";
import type { PosterClassifierConfig } from "@/lib/poster/classifier";

function toDateTimeLocalFromIso(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function SubmitActivityForm({
  interests,
  posterConfig,
}: {
  interests: InterestLabel[];
  posterConfig: PosterClassifierConfig;
}) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [orgName, setOrgName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceUrlResolved, setSourceUrlResolved] = useState("");
  const [locationType, setLocationType] = useState<"online" | "offline" | "hybrid">("offline");
  const [region, setRegion] = useState("");
  const [participationMode, setParticipationMode] = useState<"solo" | "team" | "both">("both");
  const [applyStartAt, setApplyStartAt] = useState("");
  const [applyEndAt, setApplyEndAt] = useState("");
  const [applyEndAtEvidence, setApplyEndAtEvidence] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 제보자는 분야를 "제안"만 할 수 있다 — 관리자가 승인 화면에서 확정한다(가이드 5.4 5번).
  const [primaryInterestId, setPrimaryInterestId] = useState("");
  const [secondaryInterestIds, setSecondaryInterestIds] = useState<string[]>([]);
  const [acceptedCandidateIds, setAcceptedCandidateIds] = useState<string[]>([]);
  const [pendingAnalysis, setPendingAnalysis] = useState<PosterAnalysisResult | null>(null);

  function handleAcceptCandidate(interestId: string) {
    const next = applyCandidateSelection({ primary: primaryInterestId || null, secondary: secondaryInterestIds }, interestId);
    setPrimaryInterestId(next.primary ?? "");
    setSecondaryInterestIds(next.secondary);
    setAcceptedCandidateIds((prev) => (prev.includes(interestId) ? prev : [...prev, interestId]));
  }

  function handlePrimaryChange(interestId: string) {
    setAcceptedCandidateIds((prev) => prev.filter((id) => id !== primaryInterestId));
    setPrimaryInterestId(interestId);
  }

  function handleToggleSecondary(interestId: string) {
    setSecondaryInterestIds((prev) => (prev.includes(interestId) ? prev.filter((id) => id !== interestId) : [...prev, interestId]));
    setAcceptedCandidateIds((prev) => prev.filter((id) => id !== interestId));
  }

  function handleApplyEndAtInputChange(value: string) {
    setApplyEndAt(value);
    setApplyEndAtEvidence("");
  }

  function handleImportApply(action: UrlImportApplyAction) {
    switch (action.kind) {
      case "title":
        setTitle(action.value);
        break;
      case "orgName":
        setOrgName(action.value);
        break;
      case "description":
        setDescription(action.value);
        break;
      case "sourceUrl":
        setSourceUrl(action.value);
        setSourceUrlResolved(action.resolved);
        break;
      case "date": {
        const local = toDateTimeLocalFromIso(action.iso);
        if (action.field === "applyEndAt") {
          setApplyEndAt(local);
          setApplyEndAtEvidence(action.raw);
        } else if (action.field === "applyStartAt") {
          setApplyStartAt(local);
        }
        break;
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("활동 제목을 입력해 주세요.");
      return;
    }
    setError(null);
    setSubmitting(true);
    const secondary = resolveSecondarySelection(primaryInterestId || null, secondaryInterestIds);
    const result = await submitActivityAction({
      title, summary, description, orgName, sourceUrl, locationType, region, participationMode,
      applyStartAt, applyEndAt, sourceUrlResolved, applyEndAtEvidence,
      primaryInterestId: primaryInterestId || null,
      secondaryInterestIds: secondary,
      acceptedCandidateInterestIds: acceptedCandidateIds,
      posterAnalysis: pendingAnalysis && !pendingAnalysis.fromCache ? toPendingPosterAnalysis(pendingAnalysis) : null,
    });
    setSubmitting(false);
    if (!result.ok) setError(result.error);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <UrlImportPanel
        previewAction={previewActivitySubmissionUrlAction}
        onApply={handleImportApply}
        enabledFields={["title", "orgName", "description", "sourceUrl", "date"]}
      />
      <PosterClassifierPanel
        variant="preview"
        activityId={null}
        config={posterConfig}
        interests={interests}
        onAcceptCandidate={handleAcceptCandidate}
        onAnalyzed={setPendingAnalysis}
        candidateHint="후보를 누르면 바로 아래 분야 제안 칸에 들어가요 — 확정은 관리자가 검토하며 직접 해요."
      />
      <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <h3 className="mb-2 text-sm font-semibold text-[var(--color-muted-foreground)]">분야 제안 (참고용)</h3>
        <p className="mb-2 text-xs text-[var(--color-muted-foreground)]">
          여기서 고른 분야는 &ldquo;제안&rdquo;일 뿐이에요 — 관리자가 승인하며 직접 분야를 확정해요.
        </p>
        <FieldPicker
          interests={interests}
          primary={primaryInterestId}
          onPrimaryChange={handlePrimaryChange}
          secondary={secondaryInterestIds}
          onToggleSecondary={handleToggleSecondary}
          primaryLabel="대표 분야 제안"
          secondaryLabel="부가 분야 제안 (복수 선택)"
        />
      </div>
      {error && (
        <p role="alert" className="rounded-md bg-[var(--color-danger-bg)] px-3 py-2 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}
      <label className="flex flex-col gap-1 text-sm">
        제목 *
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        한 줄 요약
        <input
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        설명
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        주최기관
        <input
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        원문 링크
        <input
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          type="url"
          placeholder="https://"
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        진행 방식
        <select
          value={locationType}
          onChange={(e) => setLocationType(e.target.value as typeof locationType)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
        >
          <option value="online">온라인</option>
          <option value="offline">오프라인</option>
          <option value="hybrid">혼합</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        지역
        <input
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        참여 형태
        <select
          value={participationMode}
          onChange={(e) => setParticipationMode(e.target.value as typeof participationMode)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
        >
          <option value="solo">개인 참여</option>
          <option value="team">팀 참여</option>
          <option value="both">개인·팀 모두 가능</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        접수 시작
        <input
          type="datetime-local"
          value={applyStartAt}
          onChange={(e) => setApplyStartAt(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        접수 마감
        <input
          type="datetime-local"
          value={applyEndAt}
          onChange={(e) => handleApplyEndAtInputChange(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
        />
        {applyEndAt && (
          applyEndAtEvidence ? (
            <span className="text-xs text-[var(--color-brand-700)]">원문에서 확인됨: “{applyEndAtEvidence}”</span>
          ) : (
            <span className="text-xs text-[var(--color-muted-foreground)]">직접 입력됨 — 운영자가 원문을 다시 확인해요</span>
          )
        )}
      </label>
      <p className="text-xs text-[var(--color-muted-foreground)]">
        제보한 활동은 운영자 검토 후 공개돼요. 검토 결과는 알림으로 알려드려요.
      </p>
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-[var(--color-brand-600)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
      >
        제보하기
      </button>
    </form>
  );
}
