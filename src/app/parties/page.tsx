import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/auth";
import { PageContainer } from "@/components/PageContainer";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/states";
import { PARTY_STATUS_LABEL, partyStatusBadgeVariant } from "@/lib/party";

interface PartyMembershipRow {
  party_id: string;
  is_leader: boolean;
  parties: {
    id: string;
    title: string | null;
    status: string;
    capacity: number;
    activities: { title: string } | null;
  } | null;
}

interface PendingApplicationRow {
  id: string;
  party_id: string;
  parties: { id: string; title: string | null; activities: { title: string } | null } | null;
}

export default async function PartiesPage() {
  const { supabase, user } = await getCurrentUserAndProfile();

  if (!user) {
    redirect("/login");
  }

  const [membershipsRes, applicationsRes] = await Promise.all([
    supabase
      .from("party_members")
      .select("party_id, is_leader, parties(id, title, status, capacity, activities(title))")
      .eq("profile_id", user.id)
      .eq("status", "active")
      .returns<PartyMembershipRow[]>(),
    supabase
      .from("party_applications")
      .select("id, party_id, parties(id, title, activities(title))")
      .eq("profile_id", user.id)
      .eq("status", "pending")
      .returns<PendingApplicationRow[]>(),
  ]);

  const memberships = (membershipsRes.data ?? []).filter((m) => m.parties);
  const led = memberships.filter((m) => m.is_leader);
  const joined = memberships.filter((m) => !m.is_leader);
  const pendingApplications = (applicationsRes.data ?? []).filter((a) => a.parties);

  return (
    <PageContainer>
      <h1 className="mb-4 text-xl font-semibold">파티</h1>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-muted-foreground)]">내가 만든 파티</h2>
        {led.length > 0 ? (
          <PartyList items={led} />
        ) : (
          <EmptyState title="아직 만든 파티가 없어요" description="활동 상세에서 파티를 만들 수 있어요." />
        )}
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-muted-foreground)]">참여 중인 파티</h2>
        {joined.length > 0 ? (
          <PartyList items={joined} />
        ) : (
          <EmptyState title="참여 중인 파티가 없어요" />
        )}
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-muted-foreground)]">지원 중</h2>
        {pendingApplications.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {pendingApplications.map((app) => (
              <li key={app.id}>
                <Link
                  href={`/parties/${app.party_id}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm"
                >
                  <span>
                    {app.parties!.activities?.title ?? "활동"} · {app.parties!.title ?? "파티"}
                  </span>
                  <Badge variant="warning">응답 대기</Badge>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="대기 중인 지원이 없어요" />
        )}
      </section>
    </PageContainer>
  );
}

function PartyList({ items }: { items: PartyMembershipRow[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => {
        const party = item.parties!;
        return (
          <li key={item.party_id}>
            <Link
              href={`/parties/${party.id}`}
              className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm"
            >
              <span>
                {party.activities?.title ?? "활동"} · {party.title ?? "파티"}
              </span>
              <Badge variant={partyStatusBadgeVariant(party.status)}>{PARTY_STATUS_LABEL[party.status] ?? party.status}</Badge>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
