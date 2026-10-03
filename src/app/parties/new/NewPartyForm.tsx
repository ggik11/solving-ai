"use client";

import { useState } from "react";
import { createPartyAction } from "../actions";

export function NewPartyForm({ activityId }: { activityId: string }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [capacity, setCapacity] = useState("4");
  const [meetingMode, setMeetingMode] = useState<"" | "online" | "offline" | "hybrid">("");
  const [recruitDeadline, setRecruitDeadline] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const capacityNum = Number(capacity);
    if (!Number.isInteger(capacityNum) || capacityNum < 1) {
      setError("정원은 1명 이상의 숫자로 입력해 주세요.");
      return;
    }
    setSubmitting(true);
    const result = await createPartyAction({
      activityId,
      title,
      description,
      capacity: capacityNum,
      meetingMode: meetingMode || null,
      recruitDeadline: recruitDeadline ? new Date(recruitDeadline).toISOString() : null,
    });
    setSubmitting(false);
    if (result && !result.ok) {
      setError(result.error);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field label="파티 이름">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 같이 준비할 팀원 구해요" className={inputClass} />
      </Field>
      <Field label="소개">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className={inputClass} />
      </Field>
      <Field label="정원 (본인 포함) *">
        <input
          type="number"
          min={1}
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          required
          className={inputClass}
        />
      </Field>
      <Field label="진행 방식">
        <select value={meetingMode} onChange={(e) => setMeetingMode(e.target.value as typeof meetingMode)} className={inputClass}>
          <option value="">선택 안 함</option>
          <option value="online">온라인</option>
          <option value="offline">오프라인</option>
          <option value="hybrid">혼합</option>
        </select>
      </Field>
      <Field label="모집 마감(선택)">
        <input
          type="datetime-local"
          value={recruitDeadline}
          onChange={(e) => setRecruitDeadline(e.target.value)}
          className={inputClass}
        />
      </Field>

      {error && (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-[var(--color-brand-600)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {submitting ? "만드는 중..." : "파티 만들기"}
      </button>
    </form>
  );
}

const inputClass = "rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}
