import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/PageContainer";
import { computeFieldAcceptanceRates, computeVerdictRatios } from "@/lib/poster/stats";
import type { ModelClassFieldMapRow, PosterAnalysisStatus } from "@/lib/poster/classifier";

const VERDICT_LABEL: Record<PosterAnalysisStatus, string> = {
  suggested: "제안됨(suggested)",
  needs_review: "확신 낮음(needs_review)",
  failed: "실패(failed)",
};

async function loadPosterClassifierStats() {
  const supabase = await createClient();
  const [{ data: analyses }, { data: classMapRows }, { data: confirmedFieldRows }, { data: interests }] = await Promise.all([
    supabase.from("poster_analyses").select("id, model_version, top_class, status").not("activity_id", "is", null),
    supabase.from("model_class_field_map").select("model_version, class_id, interest_id"),
    supabase.from("activity_fields").select("analysis_id, interest_id, accepted_model_candidate").not("analysis_id", "is", null),
    supabase.from("interests").select("id, name"),
  ]);

  const classFieldMap: ModelClassFieldMapRow[] = (classMapRows ?? []).map((m) => ({
    modelVersion: m.model_version,
    classId: m.class_id,
    interestId: m.interest_id,
  }));
  const interestName = (id: string) => (interests ?? []).find((i) => i.id === id)?.name ?? id;

  const verdictRatios = computeVerdictRatios(analyses ?? []);
  const suggested = (analyses ?? [])
    .filter((a) => a.status === "suggested")
    .map((a) => ({ id: a.id, modelVersion: a.model_version, topClass: a.top_class }));
  const confirmedFields = (confirmedFieldRows ?? []).map((f) => ({
    analysisId: f.analysis_id,
    interestId: f.interest_id,
    acceptedModelCandidate: f.accepted_model_candidate,
  }));
  const acceptanceRates = computeFieldAcceptanceRates(suggested, classFieldMap, confirmedFields).map((r) => ({
    ...r,
    interestName: interestName(r.interestId),
  }));

  return { hasAnalyses: (analyses?.length ?? 0) > 0, verdictRatios, acceptanceRates };
}

export default async function AdminHomePage() {
  const stats = await loadPosterClassifierStats();

  return (
    <PageContainer>
      <h1 className="mb-4 text-xl font-semibold">관리자</h1>

      <section className="mb-4 flex flex-col gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="text-sm font-semibold text-[var(--color-muted-foreground)]">포스터 분류 모델 통계 (가이드 5.6)</h2>
        {!stats.hasAnalyses ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">아직 분석 기록 없음</p>
        ) : (
          <>
            <div>
              <p className="mb-1 text-xs font-medium text-[var(--color-muted-foreground)]">판정 비율</p>
              <ul className="flex flex-col gap-0.5 text-sm">
                {stats.verdictRatios.map((v) => (
                  <li key={v.status}>
                    {VERDICT_LABEL[v.status]}: {v.count}건 ({Math.round(v.ratio * 100)}%)
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-[var(--color-muted-foreground)]">분야별 모델 후보 수락률</p>
              {stats.acceptanceRates.length === 0 ? (
                <p className="text-sm text-[var(--color-muted-foreground)]">아직 분석 기록 없음</p>
              ) : (
                <ul className="flex flex-col gap-0.5 text-sm">
                  {stats.acceptanceRates.map((r) => (
                    <li key={r.interestId}>
                      {r.interestName}: {r.acceptedCount}/{r.candidateCount}건 ({Math.round(r.rate * 100)}%)
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </section>

      <div className="flex flex-col gap-2">
        <Link
          href="/admin/activities"
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-medium"
        >
          활동 관리 (등록·수정·비공개)
        </Link>
        <Link
          href="/admin/activities/import"
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-medium"
        >
          CSV로 활동 가져오기
        </Link>
        <Link
          href="/admin/submissions"
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-medium"
        >
          활동 제보 검토
        </Link>
        <Link
          href="/admin/reports"
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-medium"
        >
          신고 관리
        </Link>
        <Link
          href="/admin/accounts"
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-medium"
        >
          계정 관리
        </Link>
        <Link
          href="/admin/audit-logs"
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-medium"
        >
          감사 로그
        </Link>
      </div>
    </PageContainer>
  );
}
