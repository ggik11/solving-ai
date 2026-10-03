import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/auth";
import { PageContainer } from "@/components/PageContainer";
import { ForbiddenState } from "@/components/states";
import { EditPartyForm } from "./EditPartyForm";

interface PartyRow {
  id: string;
  title: string | null;
  description: string | null;
  meeting_mode: string | null;
  recruit_deadline: string | null;
  required_common_time: { note?: string } | null;
  leader_id: string;
  status: string;
}

interface RoleSlotRow {
  id: string;
  role_name: string;
  capacity: number;
  filled_count: number;
}

export default async function EditPartyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getCurrentUserAndProfile();
  if (!user) {
    redirect("/login");
  }

  const { data: party, error } = await supabase
    .from("parties")
    .select("id, title, description, meeting_mode, recruit_deadline, required_common_time, leader_id, status")
    .eq("id", id)
    .maybeSingle<PartyRow>();

  if (error || !party) {
    notFound();
  }

  if (party.leader_id !== user.id) {
    return (
      <PageContainer>
        <ForbiddenState message="파티 정보 수정은 팀장만 할 수 있어요." />
      </PageContainer>
    );
  }

  if (party.status === "cancelled" || party.status === "completed") {
    return (
      <PageContainer>
        <ForbiddenState message="이미 종료된 파티는 수정할 수 없어요." />
      </PageContainer>
    );
  }

  const { data: roleSlots } = await supabase
    .from("party_role_slots")
    .select("id, role_name, capacity, filled_count")
    .eq("party_id", id)
    .order("role_name", { ascending: true })
    .returns<RoleSlotRow[]>();

  return (
    <PageContainer>
      <Link href={`/parties/${id}`} className="mb-3 inline-block text-sm text-[var(--color-brand-700)] underline">
        ← 파티로
      </Link>
      <h1 className="mb-4 text-xl font-semibold">파티 정보 수정</h1>
      <EditPartyForm
        partyId={id}
        initialTitle={party.title ?? ""}
        initialDescription={party.description ?? ""}
        initialMeetingMode={(party.meeting_mode as "online" | "offline" | "hybrid" | null) ?? null}
        initialRecruitDeadline={party.recruit_deadline}
        initialRequiredCommonTime={party.required_common_time?.note ?? ""}
        roleSlots={roleSlots ?? []}
      />
    </PageContainer>
  );
}
