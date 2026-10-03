"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updatePartyDetailsAction } from "../../actions";

interface RoleSlotRow {
  id: string;
  role_name: string;
  capacity: number;
  filled_count: number;
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EditPartyForm({
  partyId,
  initialTitle,
  initialDescription,
  initialMeetingMode,
  initialRecruitDeadline,
  initialRequiredCommonTime,
  roleSlots,
}: {
  partyId: string;
  initialTitle: string;
  initialDescription: string;
  initialMeetingMode: "online" | "offline" | "hybrid" | null;
  initialRecruitDeadline: string | null;
  initialRequiredCommonTime: string;
  roleSlots: RoleSlotRow[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [meetingMode, setMeetingMode] = useState<"" | "online" | "offline" | "hybrid">(initialMeetingMode ?? "");
  const [recruitDeadline, setRecruitDeadline] = useState(toDatetimeLocal(initialRecruitDeadline));
  const [requiredCommonTime, setRequiredCommonTime] = useState(initialRequiredCommonTime);
  const [capacities, setCapacities] = useState<Record<string, string>>(
    Object.fromEntries(roleSlots.map((s) => [s.id, String(s.capacity)]))
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const roleSlotCapacities = roleSlots.map((s) => ({ roleSlotId: s.id, capacity: Number(capacities[s.id]) }));
    if (roleSlotCapacities.some((r) => !Number.isInteger(r.capacity) || r.capacity < 1)) {
      setError("역할별 인원은 1명 이상의 숫자로 입력해 주세요.");
      return;
    }

    setSubmitting(true);
    const result = await updatePartyDetailsAction({
      partyId,
      title,
      description,
      meetingMode: meetingMode || null,
      recruitDeadline: recruitDeadline ? new Date(recruitDeadline).toISOString() : null,
      requiredCommonTime,
      roleSlotCapacities,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(`/parties/${partyId}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field label="파티 이름(목표)">
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
      </Field>
      <Field label="소개">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className={inputClass} />
      </Field>

      {roleSlots.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">역할별 인원</span>
          <p className="text-xs text-[var(--color-muted-foreground)]">현재 인원보다 적게 줄일 수는 없어요.</p>
          <div className="flex flex-col gap-2">
            {roleSlots.map((slot) => (
              <div key={slot.id} className="flex items-center gap-2">
                <span className="flex-1 text-sm">
                  {slot.role_name} <span className="text-xs text-[var(--color-muted-foreground)]">(현재 {slot.filled_count}명)</span>
                </span>
                <input
                  type="number"
                  min={slot.filled_count || 1}
                  value={capacities[slot.id] ?? String(slot.capacity)}
                  onChange={(e) => setCapacities((c) => ({ ...c, [slot.id]: e.target.value }))}
                  className={`${inputClass} w-20`}
                  aria-label={`${slot.role_name} 인원`}
                />
              </div>
            ))}
          </div>
        </div>
      )}

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
      <Field label="공통 시간(선택)">
        <textarea
          value={requiredCommonTime}
          onChange={(e) => setRequiredCommonTime(e.target.value)}
          placeholder="예: 평일 저녁 7시 이후, 주말 자유"
          rows={2}
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
        {submitting ? "저장하는 중..." : "저장"}
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
