import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/auth";
import { PageContainer } from "@/components/PageContainer";
import { WithdrawForm } from "./WithdrawForm";

interface LeaderPartyRow {
  party_id: string;
  parties: { id: string; title: string | null } | null;
}

export default async function WithdrawPage() {
  const { supabase, user } = await getCurrentUserAndProfile();
  if (!user) {
    redirect("/login");
  }

  const { data: leaderRows } = await supabase
    .from("party_members")
    .select("party_id, parties(id, title)")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .eq("is_leader", true)
    .returns<LeaderPartyRow[]>();

  const blockingParties: { id: string; title: string }[] = [];
  for (const row of leaderRows ?? []) {
    if (!row.parties) continue;
    const { count } = await supabase
      .from("party_members")
      .select("profile_id", { count: "exact", head: true })
      .eq("party_id", row.party_id)
      .eq("status", "active")
      .neq("profile_id", user.id);
    if ((count ?? 0) > 0) {
      blockingParties.push({ id: row.parties.id, title: row.parties.title ?? "제목 없는 파티" });
    }
  }

  return (
    <PageContainer>
      <Link href="/me" className="mb-3 inline-block text-sm text-[var(--color-brand-700)] underline">
        ← 마이로
      </Link>
      <h1 className="mb-4 text-xl font-semibold">회원 탈퇴</h1>

      {blockingParties.length > 0 ? (
        <div className="flex flex-col gap-3">
          <p className="rounded-md bg-[var(--color-danger-bg)] px-3 py-2 text-sm text-[var(--color-danger)]">
            팀장으로 있는 파티에 다른 팀원이 있어서 바로 탈퇴할 수 없어요. 먼저 팀장을 위임하거나 파티를 해산해 주세요.
          </p>
          <ul className="flex flex-col gap-2">
            {blockingParties.map((p) => (
              <li key={p.id}>
                <Link href={`/parties/${p.id}`} className="block rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm">
                  {p.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <ul className="list-disc rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4 pl-8 text-sm text-[var(--color-muted-foreground)]">
            <li>닉네임 등 프로필 정보가 &ldquo;탈퇴한 사용자&rdquo;로 비식별화돼요.</li>
            <li>대기 중인 파티 지원, 빠른 매칭 대기열·제안이 모두 정리돼요.</li>
            <li>참여 중인 파티에서는 탈퇴 처리되지만, 작성한 채팅 메시지는 팀에 남아요(작성자는 &ldquo;탈퇴한 사용자&rdquo;로 표시).</li>
            <li>이 작업은 되돌릴 수 없어요.</li>
          </ul>
          <WithdrawForm />
        </div>
      )}
    </PageContainer>
  );
}
