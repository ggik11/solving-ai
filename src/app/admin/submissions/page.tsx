import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/PageContainer";
import { EmptyState } from "@/components/states";
import { SubmissionRow, type SubmissionItem } from "./SubmissionRow";

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

  const submissions: SubmissionItem[] = (data ?? []).map((a) => ({
    id: a.id,
    title: a.title,
    summary: a.summary,
    org_name: a.org_name,
    source_url: a.source_url,
    created_at: a.created_at,
    submitter_nickname: a.profiles?.nickname ?? "알 수 없음",
  }));

  return (
    <PageContainer>
      <h1 className="mb-4 text-xl font-semibold">활동 제보 검토</h1>
      {submissions.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {submissions.map((s) => (
            <SubmissionRow key={s.id} submission={s} />
          ))}
        </ul>
      ) : (
        <EmptyState title="검토 대기 중인 제보가 없어요" />
      )}
    </PageContainer>
  );
}
