import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/auth";
import { PageContainer } from "@/components/PageContainer";
import { EmptyState } from "@/components/states";
import { BlockToggleButton } from "@/components/BlockToggleButton";

interface BlockRow {
  blocked_id: string;
  created_at: string;
  profiles: { nickname: string } | null;
}

export default async function BlockedUsersPage() {
  const { supabase, user } = await getCurrentUserAndProfile();
  if (!user) {
    redirect("/login");
  }

  const { data } = await supabase
    .from("blocks")
    .select("blocked_id, created_at, profiles:blocked_id(nickname)")
    .eq("blocker_id", user.id)
    .order("created_at", { ascending: false })
    .returns<BlockRow[]>();

  const blocked = data ?? [];

  return (
    <PageContainer>
      <Link href="/me" className="mb-3 inline-block text-sm text-[var(--color-brand-700)] underline">
        ← 마이로
      </Link>
      <h1 className="mb-4 text-xl font-semibold">차단 목록</h1>

      {blocked.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {blocked.map((b) => (
            <li
              key={b.blocked_id}
              className="flex items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm"
            >
              <span>{b.profiles?.nickname ?? "알 수 없는 사용자"}</span>
              <BlockToggleButton profileId={b.blocked_id} initialBlocked={true} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="차단한 사용자가 없어요"
          description="채팅방이나 파티 멤버 목록에서 사용자를 차단할 수 있어요."
        />
      )}
    </PageContainer>
  );
}
