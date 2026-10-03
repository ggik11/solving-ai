"use client";

import { useState } from "react";
import { createActivity, updateActivity, type ActivityFormInput } from "./actions";
import type { Activity } from "@/lib/supabase/types";

function toDateTimeLocal(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ActivityForm({
  mode,
  activityId,
  activityTypes,
  initial,
}: {
  mode: "create" | "edit";
  activityId?: string;
  activityTypes: { id: string; name: string }[];
  initial?: Activity;
}) {
  const [form, setForm] = useState<ActivityFormInput>({
    title: initial?.title ?? "",
    summary: initial?.summary ?? "",
    description: initial?.description ?? "",
    orgName: initial?.org_name ?? "",
    sourceUrl: initial?.source_url ?? "",
    locationType: initial?.location_type ?? "offline",
    region: initial?.region ?? "",
    activityTypeId: initial?.activity_type_id ?? "",
    eligibility: initial?.eligibility ?? "",
    participationMode: initial?.participation_mode ?? "both",
    teamMinSize: initial?.team_min_size != null ? String(initial.team_min_size) : "",
    teamMaxSize: initial?.team_max_size != null ? String(initial.team_max_size) : "",
    benefit: initial?.benefit ?? "",
    applyStartAt: toDateTimeLocal(initial?.apply_start_at ?? null),
    applyEndAt: toDateTimeLocal(initial?.apply_end_at ?? null),
    activityStartAt: toDateTimeLocal(initial?.activity_start_at ?? null),
    activityEndAt: toDateTimeLocal(initial?.activity_end_at ?? null),
    status: initial?.status ?? "draft",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof ActivityFormInput>(key: K, value: ActivityFormInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = mode === "create" ? await createActivity(form) : await updateActivity(activityId!, form);
    setSubmitting(false);
    if (result && !result.ok) {
      setError(result.error ?? "저장에 실패했습니다.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field label="제목 *">
        <input value={form.title} onChange={(e) => set("title", e.target.value)} required className={inputClass} />
      </Field>
      <Field label="한 줄 요약">
        <input value={form.summary} onChange={(e) => set("summary", e.target.value)} className={inputClass} />
      </Field>
      <Field label="설명">
        <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={4} className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="주최기관">
          <input value={form.orgName} onChange={(e) => set("orgName", e.target.value)} className={inputClass} />
        </Field>
        <Field label="원문 URL">
          <input type="url" value={form.sourceUrl} onChange={(e) => set("sourceUrl", e.target.value)} className={inputClass} />
        </Field>
        <Field label="진행 방식">
          <select value={form.locationType} onChange={(e) => set("locationType", e.target.value as ActivityFormInput["locationType"])} className={inputClass}>
            <option value="online">온라인</option>
            <option value="offline">오프라인</option>
            <option value="hybrid">혼합</option>
          </select>
        </Field>
        <Field label="지역">
          <input value={form.region} onChange={(e) => set("region", e.target.value)} className={inputClass} />
        </Field>
        <Field label="유형">
          <select value={form.activityTypeId} onChange={(e) => set("activityTypeId", e.target.value)} className={inputClass}>
            <option value="">미분류</option>
            {activityTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="참여 형태">
          <select value={form.participationMode} onChange={(e) => set("participationMode", e.target.value as ActivityFormInput["participationMode"])} className={inputClass}>
            <option value="solo">개인</option>
            <option value="team">팀</option>
            <option value="both">개인·팀 모두</option>
          </select>
        </Field>
        <Field label="팀 최소 인원">
          <input type="number" min={1} value={form.teamMinSize} onChange={(e) => set("teamMinSize", e.target.value)} className={inputClass} />
        </Field>
        <Field label="팀 최대 인원">
          <input type="number" min={1} value={form.teamMaxSize} onChange={(e) => set("teamMaxSize", e.target.value)} className={inputClass} />
        </Field>
      </div>
      <Field label="지원 자격">
        <textarea value={form.eligibility} onChange={(e) => set("eligibility", e.target.value)} rows={2} className={inputClass} />
      </Field>
      <Field label="비용·혜택">
        <input value={form.benefit} onChange={(e) => set("benefit", e.target.value)} className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="접수 시작">
          <input type="datetime-local" value={form.applyStartAt} onChange={(e) => set("applyStartAt", e.target.value)} className={inputClass} />
        </Field>
        <Field label="접수 마감">
          <input type="datetime-local" value={form.applyEndAt} onChange={(e) => set("applyEndAt", e.target.value)} className={inputClass} />
        </Field>
        <Field label="활동 시작">
          <input type="datetime-local" value={form.activityStartAt} onChange={(e) => set("activityStartAt", e.target.value)} className={inputClass} />
        </Field>
        <Field label="활동 종료">
          <input type="datetime-local" value={form.activityEndAt} onChange={(e) => set("activityEndAt", e.target.value)} className={inputClass} />
        </Field>
      </div>
      <Field label="공개 상태">
        <select value={form.status} onChange={(e) => set("status", e.target.value as ActivityFormInput["status"])} className={inputClass}>
          <option value="draft">비공개(draft)</option>
          <option value="published">공개</option>
          <option value="closed">마감</option>
          <option value="archived">보관</option>
        </select>
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
        {submitting ? "저장 중..." : mode === "create" ? "등록" : "수정 저장"}
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
