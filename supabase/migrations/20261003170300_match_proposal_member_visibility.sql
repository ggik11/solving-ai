-- 제안 화면에서 "팀 구성(닉네임, 역할)" 전체를 보여주려면 같은 제안의 멤버끼리 서로의
-- match_proposal_members 행을 볼 수 있어야 한다. 기존 정책(profile_id = auth.uid() or admin)은
-- 본인 행만 허용해 다른 팀원이 전혀 보이지 않았다 — party_members/is_party_member와 같은
-- SECURITY DEFINER 헬퍼 패턴으로 해결한다(테이블 소유자 권한으로 조회해 RLS 재귀를 피한다).
create or replace function public.is_match_proposal_member(p_proposal_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.match_proposal_members mpm
    where mpm.proposal_id = p_proposal_id and mpm.profile_id = auth.uid()
  );
$$;

revoke all on function public.is_match_proposal_member(uuid) from public;
grant execute on function public.is_match_proposal_member(uuid) to authenticated;

drop policy if exists match_proposal_members_select on public.match_proposal_members;
create policy match_proposal_members_select on public.match_proposal_members for select
  using (public.is_match_proposal_member(proposal_id) or public.is_admin());
