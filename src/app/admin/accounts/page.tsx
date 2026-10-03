import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/PageContainer";
import { EmptyState } from "@/components/states";
import { AccountRow, type AccountItem } from "./AccountRow";

export default async function AdminAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();

  const { data: admins } = await supabase.from("user_roles").select("profile_id").eq("role", "admin");
  const adminIds = new Set((admins ?? []).map((a) => a.profile_id as string));

  let query = supabase.from("profiles").select("id, nickname, account_status").order("nickname", { ascending: true }).limit(50);
  if (q && q.trim()) {
    query = query.ilike("nickname", `%${q.trim()}%`);
  }
  const { data } = await query;
  const accounts: AccountItem[] = (data ?? [])
    .filter((p) => !adminIds.has(p.id))
    .map((p) => ({ id: p.id, nickname: p.nickname, account_status: p.account_status }));

  return (
    <PageContainer>
      <h1 className="mb-4 text-xl font-semibold">계정 관리</h1>

      <form className="mb-4 flex gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="닉네임으로 검색"
          className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-md bg-[var(--color-brand-600)] px-4 py-2 text-sm font-medium text-white">
          검색
        </button>
      </form>

      {accounts.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {accounts.map((a) => (
            <AccountRow key={a.id} account={a} />
          ))}
        </ul>
      ) : (
        <EmptyState title="조건에 맞는 사용자가 없어요" />
      )}
    </PageContainer>
  );
}
