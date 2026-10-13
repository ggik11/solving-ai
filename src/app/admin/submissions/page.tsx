import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/PageContainer";
import { EmptyState } from "@/components/states";
import { SubmissionRow, type SubmissionItem } from "./SubmissionRow";
import { resolveCandidateInterestIds } from "@/lib/poster/classifier";

interface SubmissionRowFromDb {
  id: string;
  title: string;
  summary: string | null;
  org_name: string | null;
  source_url: string | null;
  created_at: string;
  created_by: string | null;
  profiles: { nickname: string } | null;
}

interface AnalysisRow {
  id: string;
  activity_id: string;
  model_version: string;
  status: "suggested" | "needs_review" | "failed";
  top_class: string | null;
  top_score: number | null;
  failure_reason: string | null;
  created_at: string;
}

interface ProposalRow {
  activity_id: string;
  interest_id: string;
  role: "primary" | "secondary";
  source: "manual" | "teachable_machine";
}

export default async function AdminSubmissionsPage() {
  const supabase = await createClient();
  // status='draft'인 활동 전부를 보여준다 — 사용자 제보와 운영자 자신의 미완성 초안을 구분하는
  // 별도 테이블을 두지 않았다(activities 재사용). 운영자 자신의 초안도 여기서 바로 공개할 수
  // 있어 실질적으로 유용하다 — PROGRESS.md "5-A단계" 참조.
  const { data } = await supabase
    .from("activities")
    .select("id, title, summary, org_name, source_url, created_at, created_by, profiles:created_by(nickname)")
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .returns<SubmissionRowFromDb[]>();

  const submissionIds = (data ?? []).map((a) => a.id);

  const [{ data: interests }, { data: analyses }, { data: proposals }, { data: classMap }] = await Promise.all([
    supabase.from("interests").select("id, name").eq("is_active", true).order("sort_order"),
    submissionIds.length > 0
      ? supabase
          .from("poster_analyses")
          .select("id, activity_id, model_version, status, top_class, top_score, failure_reason, created_at")
          .in("activity_id", submissionIds)
          .order("created_at", { ascending: false })
          .returns<AnalysisRow[]>()
      : Promise.resolve({ data: [] as AnalysisRow[] }),
    submissionIds.length > 0
      ? supabase
          .from("activity_field_proposals")
          .select("activity_id, interest_id, role, source")
          .in("activity_id", submissionIds)
          .returns<ProposalRow[]>()
      : Promise.resolve({ data: [] as ProposalRow[] }),
    supabase.from("model_class_field_map").select("model_version, class_id, interest_id"),
  ]);

  const interestList = (interests ?? []).map((i) => ({ id: i.id, name: i.name }));
  const interestName = (id: string) => interestList.find((i) => i.id === id)?.name ?? id;
  const classFieldMap = (classMap ?? []).map((m) => ({ modelVersion: m.model_version, classId: m.class_id, interestId: m.interest_id }));

  // 활동당 가장 최근 분석 1건만 보여준다(재분석이 여러 번 있었어도 최신 것만 참고).
  const latestAnalysisByActivity = new Map<string, AnalysisRow>();
  for (const a of analyses ?? []) {
    if (!latestAnalysisByActivity.has(a.activity_id)) latestAnalysisByActivity.set(a.activity_id, a);
  }
  const proposalsByActivity = new Map<string, ProposalRow[]>();
  for (const p of proposals ?? []) {
    const list = proposalsByActivity.get(p.activity_id) ?? [];
    list.push(p);
    proposalsByActivity.set(p.activity_id, list);
  }

  const submissions: SubmissionItem[] = (data ?? []).map((a) => {
    const analysis = latestAnalysisByActivity.get(a.id) ?? null;
    const activityProposals = proposalsByActivity.get(a.id) ?? [];
    return {
      id: a.id,
      title: a.title,
      summary: a.summary,
      org_name: a.org_name,
      source_url: a.source_url,
      created_at: a.created_at,
      submitter_nickname: a.profiles?.nickname ?? "알 수 없음",
      analysis: analysis
        ? {
            modelVersion: analysis.model_version,
            status: analysis.status,
            topClass: analysis.top_class,
            topScore: analysis.top_score,
            failureReason: analysis.failure_reason,
            candidateInterestNames:
              analysis.status === "suggested" && analysis.top_class
                ? resolveCandidateInterestIds(analysis.top_class, analysis.model_version, classFieldMap).map(interestName)
                : [],
          }
        : null,
      proposedPrimaryInterestId: activityProposals.find((p) => p.role === "primary")?.interest_id ?? null,
      proposedSecondaryInterestIds: activityProposals.filter((p) => p.role === "secondary").map((p) => p.interest_id),
      // 제보자가 모델 후보 칩을 그대로 눌러서 제안한 분야 — 관리자가 바꾸지 않고 그대로
      // 승인하면 "모델 후보를 그대로 수락"으로 기록한다(가이드 5.4 5번, 수락률 통계용).
      proposedAcceptedInterestIds: activityProposals.filter((p) => p.source === "teachable_machine").map((p) => p.interest_id),
    };
  });

  return (
    <PageContainer>
      <h1 className="mb-4 text-xl font-semibold">활동 제보 검토</h1>
      {submissions.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {submissions.map((s) => (
            <SubmissionRow key={s.id} submission={s} interests={interestList} />
          ))}
        </ul>
      ) : (
        <EmptyState title="검토 대기 중인 제보가 없어요" />
      )}
    </PageContainer>
  );
}
