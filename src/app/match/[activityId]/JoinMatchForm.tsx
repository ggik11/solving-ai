"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { joinMatchingQueueAction } from "./actions";
import type { MatchTemplate, MatchTemplateRole } from "@/lib/supabase/types";

interface TemplateWithRoles extends MatchTemplate {
  roles: MatchTemplateRole[];
}

export function JoinMatchForm({ activityId, templates }: { activityId: string; templates: TemplateWithRoles[] }) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [eligibleRoles, setEligibleRoles] = useState<string[]>([]);
  const [willingLeader, setWillingLeader] = useState(false);
  const [continueOnFail, setContinueOnFail] = useState(true);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedTemplate = templates.find((t) => t.id === templateId) ?? templates[0];

  function toggleRole(roleName: string) {
    setEligibleRoles((prev) => (prev.includes(roleName) ? prev.filter((r) => r !== roleName) : [...prev, roleName]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!templateId) {
      setError("템플릿을 선택해 주세요.");
      return;
    }
    if (eligibleRoles.length === 0) {
      setError("수행 가능한 역할을 1개 이상 선택해 주세요.");
      return;
    }
    if (!consent) {
      setError("매칭 참여에 동의해야 참가할 수 있어요.");
      return;
    }

    setSubmitting(true);
    const result = await joinMatchingQueueAction({
      activityId,
      templateId,
      eligibleRoles,
      willingLeader,
      continueOnFail,
    });
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <label className="flex flex-col gap-1 text-sm font-medium">
        템플릿
        <select
          value={templateId}
          onChange={(e) => {
            setTemplateId(e.target.value);
            setEligibleRoles([]);
          }}
          className={inputClass}
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {selectedTemplate && (
          <span className="text-xs text-[var(--color-muted-foreground)]">
            {selectedTemplate.roles.map((r) => `${r.role_name} ${r.capacity}명`).join(" · ")}
          </span>
        )}
      </label>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm font-medium">수행 가능한 역할 (복수 선택 가능) *</legend>
        {selectedTemplate?.roles.map((r) => (
          <label key={r.role_name} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={eligibleRoles.includes(r.role_name)} onChange={() => toggleRole(r.role_name)} />
            {r.role_name}
          </label>
        ))}
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={willingLeader} onChange={(e) => setWillingLeader(e.target.checked)} />
        팀장을 맡을 수 있어요
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={continueOnFail} onChange={(e) => setContinueOnFail(e.target.checked)} />
        제안이 실패하면(거절·만료) 계속 찾아주세요
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        빠른 매칭 참여에 동의합니다 *
      </label>

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
        {submitting ? "참가하는 중..." : "빠른 매칭 참가하기"}
      </button>
    </form>
  );
}

const inputClass = "rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm";
