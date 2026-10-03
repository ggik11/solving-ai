import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/auth";
import { PageContainer } from "@/components/PageContainer";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/states";
import { formatKst } from "@/lib/format";
import {
  APPLICATION_STATUS_LABEL,
  PARTY_STATUS_LABEL,
  formatRoleSlotSummary,
  missingRoleNames,
  partyStatusBadgeVariant,
  type RoleSlotSummary,
} from "@/lib/party";
import { blockedCounterpartIds, type BlockRow } from "@/lib/blocks";
import { BlockToggleButton } from "@/components/BlockToggleButton";
import { PartyActionsPanel } from "./PartyActionsPanel";
import { ApplicationDecisionButtons } from "./ApplicationDecisionButtons";

interface PartyRow {
  id: string;
  activity_id: string;
  title: string | null;
  description: string | null;
  capacity: number;
  meeting_mode: string | null;
  status: string;
  recruit_deadline: string | null;
  leader_id: string;
  activities: { id: string; title: string } | null;
}

interface MemberRow {
  profile_id: string;
  is_leader: boolean;
  is_confirmed: boolean;
  joined_at: string;
  profiles: { nickname: string } | null;
  party_role_slots: { role_name: string } | null;
}

interface ApplicationRow {
  id: string;
  profile_id: string;
  role_slot_id: string | null;
  message: string | null;
  status: string;
  created_at: string;
  profiles: { nickname: string } | null;
  party_role_slots: { role_name: string } | null;
}

const MEETING_MODE_LABEL: Record<string, string> = { online: "온라인", offline: "오프라인", hybrid: "혼합" };

export default async function PartyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getCurrentUserAndProfile();

  if (!user) {
    redirect("/login");
  }

  const { data: party, error } = await supabase
    .from("parties")
    .select("id, activity_id, title, description, capacity, meeting_mode, status, recruit_deadline, leader_id, activities(id, title)")
    .eq("id", id)
    .maybeSingle<PartyRow>();

  if (error || !party) {
    notFound();
  }

  const [membersRes, myApplicationRes, roleSlotsRes, blocksRes] = await Promise.all([
    supabase
      .from("party_members")
      .select("profile_id, is_leader, is_confirmed, joined_at, profiles(nickname), party_role_slots(role_name)")
      .eq("party_id", id)
      .eq("status", "active")
      .order("is_leader", { ascending: false })
      .order("joined_at", { ascending: true })
      .returns<MemberRow[]>(),
    supabase
      .from("party_applications")
      .select("id, role_slot_id")
      .eq("party_id", id)
      .eq("profile_id", user.id)
      .eq("status", "pending")
      .maybeSingle(),
    supabase
      .from("party_role_slots")
      .select("id, role_name, capacity, filled_count")
      .eq("party_id", id)
      .order("role_name", { ascending: true })
      .returns<RoleSlotSummary[]>(),
    supabase.from("blocks").select("blocker_id, blocked_id").or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`).returns<BlockRow[]>(),
  ]);
  const blockedIds = blockedCounterpartIds(user.id, blocksRes.data ?? []);

  const members = membersRes.data ?? [];
  const roleSlots = roleSlotsRes.data ?? [];
  const isLeader = party.leader_id === user.id;
  const isMember = members.some((m) => m.profile_id === user.id);
  const myPendingApplicationId = myApplicationRes.data?.id ?? null;
  const openRoleSlots = roleSlots.filter((s) => s.filled_count < s.capacity);

  const applicationsRes = isLeader
    ? await supabase
        .from("party_applications")
        .select("id, profile_id, role_slot_id, message, status, created_at, profiles(nickname), party_role_slots(role_name)")
        .eq("party_id", id)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .returns<ApplicationRow[]>()
    : null;
  const pendingApplications = applicationsRes?.data ?? [];

  const otherActiveMembers = members
    .filter((m) => m.profile_id !== user.id)
    .map((m) => ({ profileId: m.profile_id, nickname: m.profiles?.nickname ?? "멤버" }));

  return (
    <PageContainer>
      <Link href="/parties" className="mb-3 inline-block text-sm text-[var(--color-brand-700)] underline">
        ← 내 파티 목록으로
      </Link>

      <div className="mb-2 flex items-center gap-2">
        <Badge variant={partyStatusBadgeVariant(party.status)}>{PARTY_STATUS_LABEL[party.status] ?? party.status}</Badge>
        {party.activities && (
          <Link href={`/activities/${party.activities.id}`} className="text-xs text-[var(--color-brand-700)] underline">
            {party.activities.title}
          </Link>
        )}
      </div>

      <div className="mb-1 flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{party.title ?? "제목 없는 파티"}</h1>
        {isLeader && party.status !== "cancelled" && party.status !== "completed" && (
          <Link href={`/parties/${party.id}/edit`} className="shrink-0 text-sm text-[var(--color-brand-700)] underline">
            정보 수정
          </Link>
        )}
      </div>
      {party.description && <p className="mb-4 text-sm whitespace-pre-wrap">{party.description}</p>}

      <section className="mb-4 flex flex-col gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm">
        <Row label="정원" value={`${members.length} / ${party.capacity}명`} />
        {roleSlots.length > 0 && <Row label="역할별 현황" value={formatRoleSlotSummary(roleSlots)} />}
        {party.meeting_mode && <Row label="진행 방식" value={MEETING_MODE_LABEL[party.meeting_mode] ?? party.meeting_mode} />}
        {party.recruit_deadline && <Row label="모집 마감" value={formatKst(party.recruit_deadline)} />}
      </section>

      {party.status === "recruiting" && missingRoleNames(roleSlots).length > 0 && (
        <p className="mb-4 text-xs text-[var(--color-muted-foreground)]">
          부족한 역할: {missingRoleNames(roleSlots).join(", ")}
        </p>
      )}

      <section className="mb-4">
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-muted-foreground)]">멤버</h2>
        <ul className="flex flex-col gap-1.5">
          {members.map((m) => (
            <li
              key={m.profile_id}
              className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
            >
              <span>
                {m.profiles?.nickname ?? "멤버"}
                {m.party_role_slots && (
                  <span className="ml-1.5 text-xs text-[var(--color-muted-foreground)]">{m.party_role_slots.role_name}</span>
                )}
              </span>
              <div className="flex items-center gap-1.5">
                {m.is_leader && <Badge variant="info">팀장</Badge>}
                {m.is_confirmed && <Badge variant="success">확정</Badge>}
                {m.profile_id !== user.id && (
                  <BlockToggleButton profileId={m.profile_id} initialBlocked={blockedIds.has(m.profile_id)} />
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {isLeader && (
        <section className="mb-4">
          <h2 className="mb-2 text-sm font-semibold text-[var(--color-muted-foreground)]">대기 중인 지원</h2>
          {pendingApplications.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {pendingApplications.map((app) => (
                <li
                  key={app.id}
                  className="flex items-start justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm"
                >
                  <div>
                    <p className="font-medium">
                      {app.profiles?.nickname ?? "지원자"}
                      {app.party_role_slots && (
                        <span className="ml-1.5 text-xs text-[var(--color-muted-foreground)]">{app.party_role_slots.role_name}</span>
                      )}
                    </p>
                    {app.message && <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">{app.message}</p>}
                  </div>
                  <ApplicationDecisionButtons applicationId={app.id} partyId={party.id} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="대기 중인 지원이 없어요" />
          )}
        </section>
      )}

      {!isLeader && !isMember && myPendingApplicationId && (
        <p className="mb-4 text-sm text-[var(--color-muted-foreground)]">
          지원 상태: <Badge variant="warning">{APPLICATION_STATUS_LABEL.pending}</Badge>
        </p>
      )}

      <PartyActionsPanel
        partyId={party.id}
        status={party.status}
        isLeader={isLeader}
        isMember={isMember}
        myPendingApplicationId={myPendingApplicationId}
        otherActiveMembers={otherActiveMembers}
        openRoleSlots={openRoleSlots.map((s) => ({ id: s.id, roleName: s.role_name }))}
      />
    </PageContainer>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-[var(--color-muted-foreground)]">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
