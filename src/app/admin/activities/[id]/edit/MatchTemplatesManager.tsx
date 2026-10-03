"use client";

import { useState } from "react";
import {
  createMatchTemplateAction,
  deleteMatchTemplateAction,
  setMatchTemplateActiveAction,
  type MatchTemplateRoleInput,
} from "../../actions";

export interface MatchTemplateSummary {
  id: string;
  name: string;
  isActive: boolean;
  roles: { roleName: string; capacity: number }[];
}

interface RoleRow {
  roleName: string;
  capacity: string;
}

export function MatchTemplatesManager({ activityId, templates }: { activityId: string; templates: MatchTemplateSummary[] }) {
  const [name, setName] = useState("");
  const [roleRows, setRoleRows] = useState<RoleRow[]>([{ roleName: "", capacity: "1" }]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

    const roles: MatchTemplateRoleInput[] = roleRows.map((r) => ({ roleName: r.roleName.trim(), capacity: Number(r.capacity) }));
    setSubmitting(true);
    const result = await createMatchTemplateAction(activityId, name, roles);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setName("");
    setRoleRows([{ roleName: "", capacity: "1" }]);
  }

  async function handleToggle(templateId: string, isActive: boolean) {
    await setMatchTemplateActiveAction(templateId, activityId, !isActive);
  }

  async function handleDelete(templateId: string) {
    if (!window.confirm("이 템플릿을 삭제할까요?")) return;
    const result = await deleteMatchTemplateAction(templateId, activityId);
    if (!result.ok) setError(result.error);
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h2 className="text-sm font-semibold text-[var(--color-muted-foreground)]">빠른 매칭 역할 구성 템플릿</h2>

      {templates.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {templates.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
              <div>
                <p className="font-medium">
                  {t.name} {!t.isActive && <span className="text-xs text-[var(--color-muted-foreground)]">(비활성)</span>}
                </p>
                <p className="text-xs text-[var(--color-muted-foreground)]">
                  {t.roles.map((r) => `${r.roleName} ${r.capacity}명`).join(" · ")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button type="button" onClick={() => handleToggle(t.id, t.isActive)} className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs">
                  {t.isActive ? "비활성화" : "활성화"}
                </button>
                <button type="button" onClick={() => handleDelete(t.id)} className="rounded-md border border-[var(--color-danger)]/40 px-2 py-1 text-xs text-[var(--color-danger)]">
                  삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--color-muted-foreground)]">아직 템플릿이 없어요. 추가하면 이 활동에서 빠른 매칭을 쓸 수 있어요.</p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-2 border-t border-[var(--color-border)] pt-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          새 템플릿 이름 (예: 4인: 기획1+개발2+디자인1)
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </label>

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
        <button type="button" onClick={addRole} className="self-start rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium">
          역할 추가
        </button>

        {error && (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="self-start rounded-md bg-[var(--color-brand-600)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {submitting ? "추가하는 중..." : "템플릿 추가"}
        </button>
      </form>
    </section>
  );
}

const inputClass = "rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm";
