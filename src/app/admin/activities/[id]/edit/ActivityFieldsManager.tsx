"use client";

import { useState } from "react";
import { setActivityFieldsAction } from "../../actions";

export interface InterestOption {
  id: string;
  name: string;
}

export interface ActivityFieldSummary {
  interestId: string;
  role: "primary" | "secondary";
}

/**
 * 관리자 수동 분야 확정 화면(G2, 가이드 3.2). 모델 후보 제안은 G3에서 이 위에 얹는다 —
 * 지금은 "대표 1개 + 부가 여러 개"를 사람이 직접 고르는 것만 지원한다.
 */
export interface PendingFieldCandidate {
  interestId: string;
  /** 같은 분야를 연달아 클릭해도 useEffect가 다시 반응하도록 클릭마다 바뀌는 값(예: Date.now()). */
  nonce: number;
}

export function ActivityFieldsManager({
  activityId,
  interests,
  initialFields,
  pendingCandidate,
}: {
  activityId: string;
  interests: InterestOption[];
  initialFields: ActivityFieldSummary[];
  /** PosterClassifierPanel에서 "분야 후보" 칩을 눌렀을 때 전달된다(가이드 5.4 4번) — 저장 전까지는 확정이 아니다. */
  pendingCandidate?: PendingFieldCandidate | null;
}) {
  const initialPrimary = initialFields.find((f) => f.role === "primary")?.interestId ?? "";
  const initialSecondary = initialFields.filter((f) => f.role === "secondary").map((f) => f.interestId);

  const [primary, setPrimary] = useState(initialPrimary);
  const [secondary, setSecondary] = useState<string[]>(initialSecondary);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [appliedNonce, setAppliedNonce] = useState<number | null>(null);

  // 렌더링 중 props 변화에 맞춰 상태를 조정하는 React 권장 패턴(useEffect 대신) — 분야 후보
  // 칩을 누를 때마다 nonce가 바뀌어 들어온다.
  if (pendingCandidate && pendingCandidate.nonce !== appliedNonce) {
    setAppliedNonce(pendingCandidate.nonce);
    setSaved(false);
    if (!primary) {
      setPrimary(pendingCandidate.interestId);
    } else if (primary !== pendingCandidate.interestId && !secondary.includes(pendingCandidate.interestId)) {
      setSecondary([...secondary, pendingCandidate.interestId]);
    }
  }

  function toggleSecondary(id: string) {
    setSaved(false);
    setSecondary((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await setActivityFieldsAction(activityId, primary || null, secondary);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(true);
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h2 className="text-sm font-semibold text-[var(--color-muted-foreground)]">분야 확정</h2>
      <p className="text-xs text-[var(--color-muted-foreground)]">
        추천 계산에는 여기서 확정한 분야만 쓰여요. 대표 분야는 1개만 고를 수 있어요.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          대표 분야
          <select
            value={primary}
            onChange={(e) => {
              setSaved(false);
              setPrimary(e.target.value);
            }}
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
          <p className="mb-1 text-sm font-medium">부가 분야 (복수 선택)</p>
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
                    onClick={() => toggleSecondary(i.id)}
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

        {error && (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {error}
          </p>
        )}
        {saved && !error && <p className="text-sm text-[var(--color-brand-700)]">분야를 저장했어요.</p>}

        <button
          type="submit"
          disabled={submitting}
          className="self-start rounded-md bg-[var(--color-brand-600)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {submitting ? "저장 중..." : "분야 저장"}
        </button>
      </form>
    </section>
  );
}
