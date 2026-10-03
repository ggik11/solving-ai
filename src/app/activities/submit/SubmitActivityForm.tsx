"use client";

import { useState } from "react";
import { submitActivityAction } from "./actions";

export function SubmitActivityForm() {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [orgName, setOrgName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [locationType, setLocationType] = useState<"online" | "offline" | "hybrid">("offline");
  const [region, setRegion] = useState("");
  const [participationMode, setParticipationMode] = useState<"solo" | "team" | "both">("both");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("활동 제목을 입력해 주세요.");
      return;
    }
    setError(null);
    setSubmitting(true);
    const result = await submitActivityAction({
      title, summary, description, orgName, sourceUrl, locationType, region, participationMode,
    });
    setSubmitting(false);
    if (!result.ok) setError(result.error);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
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
