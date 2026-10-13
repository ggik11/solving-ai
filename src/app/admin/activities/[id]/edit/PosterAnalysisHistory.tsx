import { formatKst } from "@/lib/format";

export interface PosterAnalysisHistoryRow {
  id: string;
  model_version: string;
  status: "suggested" | "needs_review" | "failed";
  top_class: string | null;
  top_score: number | null;
  failure_reason: string | null;
  created_at: string;
}

const STATUS_LABEL: Record<PosterAnalysisHistoryRow["status"], string> = {
  suggested: "제안됨",
  needs_review: "확신 낮음",
  failed: "실패",
};

/**
 * 관리자 검토 화면(가이드 5.6) — 원문 링크는 이미 ActivityForm에 있으니, 여기서는 포스터 분석
 * 결과(점수·판정·모델 버전)만 확정 분야 섹션 옆에 나란히 보여준다. 재분석이 확정값을 바꾸지
 * 않는다는 걸 눈으로 확인할 수 있도록, 이 이력은 ActivityFieldsManager와 별개로 표시한다.
 */
export function PosterAnalysisHistory({ analyses }: { analyses: PosterAnalysisHistoryRow[] }) {
  if (analyses.length === 0) {
    return (
      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="text-sm font-semibold text-[var(--color-muted-foreground)]">포스터 분석 이력</h2>
        <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">아직 분석한 적이 없어요.</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h2 className="text-sm font-semibold text-[var(--color-muted-foreground)]">포스터 분석 이력</h2>
      <p className="text-xs text-[var(--color-muted-foreground)]">
        모델 후보일 뿐이며 확정 분야를 바꾸지 않아요 — 확정은 위 &ldquo;분야 확정&rdquo; 섹션에서만 해요.
      </p>
      <ul className="flex flex-col gap-1 text-xs text-[var(--color-muted-foreground)]">
        {analyses.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] pt-1 first:border-t-0 first:pt-0">
            <span>{formatKst(a.created_at)}</span>
            <span>모델 {a.model_version}</span>
            <span>{STATUS_LABEL[a.status]}</span>
            {a.top_class && <span>1위 {a.top_class}</span>}
            {a.top_score != null && <span>{Math.round(a.top_score * 100)}%</span>}
            {a.failure_reason && <span>({a.failure_reason})</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
