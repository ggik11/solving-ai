import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/auth";
import { PageContainer } from "@/components/PageContainer";
import { EmptyState } from "@/components/states";
import type { MatchTemplateRole } from "@/lib/supabase/types";
import { JoinMatchForm } from "./JoinMatchForm";
import { WaitingPanel } from "./WaitingPanel";
import { ProposalPanel, type ProposalMemberView } from "./ProposalPanel";

interface TemplateRow {
  id: string;
  activity_id: string;
  name: string;
  is_active: boolean;
  activity_match_template_roles: MatchTemplateRole[];
}

interface MyQueueRow {
  id: string;
  status: string;
  template_id: string;
}

interface WaitingQueueRow {
  eligible_roles: string[];
}

interface ProposalMemberRow {
  profile_id: string;
  role_name: string;
  response: "pending" | "accepted" | "declined";
  profiles: { nickname: string } | null;
}

export default async function MatchActivityPage({ params }: { params: Promise<{ activityId: string }> }) {
  const { activityId } = await params;
  const { supabase, user } = await getCurrentUserAndProfile();

  if (!user) {
    redirect("/login");
  }

  const { data: activity } = await supabase
    .from("activities")
    .select("id, title, status, participation_mode")
    .eq("id", activityId)
    .maybeSingle();

  if (!activity || activity.status !== "published" || activity.participation_mode === "solo") {
    notFound();
  }

  const [templatesRes, availabilityRes, myQueueRes] = await Promise.all([
    supabase
      .from("activity_match_templates")
      .select("id, activity_id, name, is_active, activity_match_template_roles(role_name, capacity)")
      .eq("activity_id", activityId)
      .eq("is_active", true)
      .returns<TemplateRow[]>(),
    supabase.from("availability_slots").select("id").eq("profile_id", user.id).limit(1),
    supabase
      .from("matching_queue")
      .select("id, status, template_id")
      .eq("activity_id", activityId)
      .eq("profile_id", user.id)
      .in("status", ["waiting", "proposed"])
      .maybeSingle<MyQueueRow>(),
  ]);

  const templates = templatesRes.data ?? [];
  const hasAvailability = (availabilityRes.data?.length ?? 0) > 0;
  const myQueue = myQueueRes.data;

  return (
    <PageContainer>
      <Link href={`/activities/${activityId}`} className="mb-3 inline-block text-sm text-[var(--color-brand-700)] underline">
        ← {activity.title}로
      </Link>
      <h1 className="mb-4 text-xl font-semibold">빠른 매칭</h1>

      {templates.length === 0 ? (
        <EmptyState title="아직 빠른 매칭을 지원하지 않는 활동이에요" description="대신 파티를 직접 만들거나 지원해 보세요." />
      ) : !hasAvailability ? (
        <EmptyState
          title="가능한 시간을 먼저 설정해 주세요"
          description="빠른 매칭은 팀 전원의 공통 시간을 계산하므로, 가능한 시간을 입력해야 참가할 수 있어요."
          action={
            <Link href="/me/edit" className="rounded-md bg-[var(--color-brand-600)] px-4 py-2 text-sm font-medium text-white">
              가능 시간 설정하러 가기
            </Link>
          }
        />
      ) : !myQueue ? (
        <JoinMatchForm
          activityId={activityId}
          templates={templates.map((t) => ({
            id: t.id,
            activity_id: t.activity_id,
            name: t.name,
            is_active: t.is_active,
            roles: t.activity_match_template_roles,
          }))}
        />
      ) : myQueue.status === "waiting" ? (
        await renderWaitingPanel(supabase, activityId, myQueue)
      ) : (
        await renderProposalPanel(supabase, activityId, myQueue.id, user.id)
      )}
    </PageContainer>
  );
}

async function renderWaitingPanel(
  supabase: Awaited<ReturnType<typeof getCurrentUserAndProfile>>["supabase"],
  activityId: string,
  myQueue: MyQueueRow
) {
  const [{ data: waitingRows }, { data: templateRoles }] = await Promise.all([
    supabase
      .from("matching_queue")
      .select("eligible_roles")
      .eq("activity_id", activityId)
      .eq("template_id", myQueue.template_id)
      .eq("status", "waiting")
      .returns<WaitingQueueRow[]>(),
    supabase.from("activity_match_template_roles").select("role_name").eq("template_id", myQueue.template_id),
  ]);

  const rows = waitingRows ?? [];
  const coveredRoles = new Set(rows.flatMap((r) => r.eligible_roles));
  const missingRoles = (templateRoles ?? []).map((r) => r.role_name).filter((name) => !coveredRoles.has(name));

  return <WaitingPanel activityId={activityId} queueId={myQueue.id} waitingCount={rows.length} missingRoles={missingRoles} />;
}

async function renderProposalPanel(
  supabase: Awaited<ReturnType<typeof getCurrentUserAndProfile>>["supabase"],
  activityId: string,
  myQueueId: string,
  myProfileId: string
) {
  const { data: myMembership } = await supabase
    .from("match_proposal_members")
    .select("proposal_id")
    .eq("queue_id", myQueueId)
    .maybeSingle();

  if (!myMembership) {
    return <EmptyState title="제안 정보를 찾을 수 없어요" description="새로고침해 보세요." />;
  }

  const { data: proposal } = await supabase
    .from("match_proposals")
    .select("id, status, proposed_leader_profile_id, expires_at, common_minutes")
    .eq("id", myMembership.proposal_id)
    .maybeSingle();

  if (!proposal || proposal.status !== "proposed") {
    return <EmptyState title="이미 처리된 제안이에요" description="새로고침하면 최신 상태를 볼 수 있어요." />;
  }

  const { data: memberRows } = await supabase
    .from("match_proposal_members")
    .select("profile_id, role_name, response, profiles(nickname)")
    .eq("proposal_id", proposal.id)
    .returns<ProposalMemberRow[]>();

  const members: ProposalMemberView[] = (memberRows ?? []).map((m) => ({
    profileId: m.profile_id,
    nickname: m.profiles?.nickname ?? "팀원",
    roleName: m.role_name,
    isProposedLeader: m.profile_id === proposal.proposed_leader_profile_id,
    response: m.response,
  }));

  const myResponse = members.find((m) => m.profileId === myProfileId)?.response ?? "pending";

  return (
    <ProposalPanel
      activityId={activityId}
      proposalId={proposal.id}
      members={members}
      commonMinutes={proposal.common_minutes}
      expiresAt={proposal.expires_at}
      myResponse={myResponse}
    />
  );
}
