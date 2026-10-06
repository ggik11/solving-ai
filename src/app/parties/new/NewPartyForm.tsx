"use client";

import { useState } from "react";
import { createPartyAction } from "../actions";
import { RECRUIT_DEADLINE_ISSUE_LABEL, validateRecruitDeadline } from "@/lib/party";

interface RoleRow {
  roleName: string;
  capacity: string;
}

export function NewPartyForm({ activityId }: { activityId: string }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [meetingMode, setMeetingMode] = useState<"" | "online" | "offline" | "hybrid">("");
  const [recruitDeadline, setRecruitDeadline] = useState("");
  const [roleRows, setRoleRows] = useState<RoleRow[]>([{ roleName: "", capacity: "1" }]);
  const [leaderRoleName, setLeaderRoleName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const validRoleNames = roleRows.map((r) => r.roleName.trim()).filter((n) => n.length > 0);
  const totalCapacity = roleRows.reduce((sum, r) => sum + (Number(r.capacity) || 0), 0);

  function updateRole(index: number, patch: Partial<RoleRow>) {
    setRoleRows((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addRole() {
    setRoleRows((rows) => [...rows, { roleName: "", capacity: "1" }]);
  }

  function removeRole(index: number) {
    setRoleRows((rows) => rows.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const roleSlots = roleRows.map((r) => ({ roleName: r.roleName.trim(), capacity: Number(r.capacity) }));
    if (roleSlots.length === 0 || roleSlots.some((r) => !r.roleName)) {
      setError("역할 이름을 모두 입력해 주세요.");
      return;
    }
    if (roleSlots.some((r) => !Number.isInteger(r.capacity) || r.capacity < 1)) {
      setError("역할별 인원은 1명 이상의 숫자로 입력해 주세요.");
      return;
    }
    const names = roleSlots.map((r) => r.roleName);
    if (new Set(names).size !== names.length) {
      setError("역할 이름이 중복되지 않게 입력해 주세요.");
      return;
    }
    if (!leaderRoleName) {
      setError("팀장이 맡을 역할을 선택해 주세요.");
      return;
    }
    const deadlineIssue = validateRecruitDeadline(recruitDeadline);
    if (deadlineIssue) {
      setError(`모집 마감: ${RECRUIT_DEADLINE_ISSUE_LABEL[deadlineIssue]}`);
      return;
    }

    setSubmitting(true);
    const result = await createPartyAction({
      activityId,
      title,
      description,
      meetingMode: meetingMode || null,
      recruitDeadline: recruitDeadline ? new Date(recruitDeadline).toISOString() : null,
      roleSlots,
      leaderRoleName,
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

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">역할별 인원 *</span>
        <p className="text-xs text-[var(--color-muted-foreground)]">
          팀장 본인도 역할 하나를 맡아요. 전체 정원은 역할별 인원의 합({totalCapacity}명)으로 정해져요.
        </p>
        <div className="flex flex-col gap-2">
          {roleRows.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={row.roleName}
                onChange={(e) => updateRole(i, { roleName: e.target.value })}
                placeholder="역할 (예: 기획, 개발, 디자인)"
                className={`${inputClass} flex-1`}
              />
              <input
                type="number"
                min={1}
                value={row.capacity}
                onChange={(e) => updateRole(i, { capacity: e.target.value })}
                className={`${inputClass} w-20`}
                aria-label={`${row.roleName || "역할"} 인원`}
              />
              <button
                type="button"
                onClick={() => removeRole(i)}
                disabled={roleRows.length <= 1}
                className="shrink-0 rounded-md border border-[var(--color-border)] px-2 py-2 text-xs disabled:opacity-40"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addRole}
          className="self-start rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium"
        >
          역할 추가
        </button>
      </div>

      <Field label="팀장이 맡을 역할 *">
        <select value={leaderRoleName} onChange={(e) => setLeaderRoleName(e.target.value)} className={inputClass}>
          <option value="">선택해 주세요</option>
          {validRoleNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
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
