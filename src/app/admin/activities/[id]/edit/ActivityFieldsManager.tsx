"use client";

import { useState } from "react";
import { setActivityFieldsAction } from "../../actions";
import { FieldPicker } from "@/components/FieldPicker";
import { applyCandidateSelection, resolveSecondarySelection } from "@/lib/poster/fieldSelection";

export interface InterestOption {
  id: string;
  name: string;
}

export interface ActivityFieldSummary {
  interestId: string;
  role: "primary" | "secondary";
}

/**
 * 관리자 수동 분야 확정 화면(G2, 가이드 3.2) + 모델 후보 수락(G3, 가이드 5.4 5번).
 * "대표 1개 + 부가 여러 개"를 사람이 직접 고르거나, 모델 후보 칩을 그대로 수락할 수 있다.
 */
export interface PendingFieldCandidate {
  interestId: string;
  /** 이 후보를 제안한 분석의 id — 저장 시 activity_fields.analysis_id/accepted_model_candidate에 쓴다. */
  analysisId: string | null;
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
  // interestId -> 그 분야를 확정으로 이끈 분석 id. 모델 후보를 그대로 눌러서 들어온 분야만 있다.
  const [acceptedMap, setAcceptedMap] = useState<Record<string, string | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [appliedNonce, setAppliedNonce] = useState<number | null>(null);

  // 렌더링 중 props 변화에 맞춰 상태를 조정하는 React 권장 패턴(useEffect 대신) — 분야 후보
  // 칩을 누를 때마다 nonce가 바뀌어 들어온다.
  if (pendingCandidate && pendingCandidate.nonce !== appliedNonce) {
    setAppliedNonce(pendingCandidate.nonce);
    setSaved(false);
    const next = applyCandidateSelection({ primary: primary || null, secondary }, pendingCandidate.interestId);
    setPrimary(next.primary ?? "");
    setSecondary(next.secondary);
    setAcceptedMap((prev) => ({ ...prev, [pendingCandidate.interestId]: pendingCandidate.analysisId }));
  }

  function handlePrimaryChange(id: string) {
    setSaved(false);
    setAcceptedMap((prev) => {
      const next = { ...prev };
      delete next[primary];
      return next;
    });
    setPrimary(id);
  }

  function toggleSecondary(id: string) {
    setSaved(false);
    setSecondary((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setAcceptedMap((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const resolvedSecondary = resolveSecondarySelection(primary || null, secondary);
    const result = await setActivityFieldsAction(activityId, primary || null, resolvedSecondary, acceptedMap);
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
        <FieldPicker
          interests={interests}
          primary={primary}
          onPrimaryChange={handlePrimaryChange}
          secondary={secondary}
          onToggleSecondary={toggleSecondary}
        />

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
