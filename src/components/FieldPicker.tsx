"use client";

export interface FieldPickerInterest {
  id: string;
  name: string;
}

/**
 * 대표 1개(select) + 부가 다중(토글) 분야 선택 UI(가이드 3.2/5.4). 등록(ActivityForm 생성 모드)·
 * 제보(SubmitActivityForm)·수정(ActivityFieldsManager)이 모두 같은 모양을 쓴다 — 저장 동작은
 * 쓰는 쪽이 각자 다르게 처리한다(이 컴포넌트는 순수하게 선택 상태만 다룬다).
 */
export function FieldPicker({
  interests,
  primary,
  onPrimaryChange,
  secondary,
  onToggleSecondary,
  primaryLabel = "대표 분야",
  secondaryLabel = "부가 분야 (복수 선택)",
}: {
  interests: FieldPickerInterest[];
  primary: string;
  onPrimaryChange: (interestId: string) => void;
  secondary: string[];
  onToggleSecondary: (interestId: string) => void;
  primaryLabel?: string;
  secondaryLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm font-medium">
        {primaryLabel}
        <select
          value={primary}
          onChange={(e) => onPrimaryChange(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
        >
          <option value="">선택 안 함</option>
          {interests.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      </label>

      <div>
        <p className="mb-1 text-sm font-medium">{secondaryLabel}</p>
        <div className="flex flex-wrap gap-2">
          {interests
            .filter((i) => i.id !== primary)
            .map((i) => {
              const selected = secondary.includes(i.id);
              return (
                <button
                  key={i.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onToggleSecondary(i.id)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    selected
                      ? "border-[var(--color-brand-600)] bg-[var(--color-brand-600)] text-white"
                      : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--foreground)]"
                  }`}
                >
                  {i.name}
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
}
