-- party_members의 자기 참조 정책이 "infinite recursion detected in policy"(42P17)를 냈던 문제를
-- SECURITY DEFINER 헬퍼 함수로 해결한다. 함수는 테이블 소유자(postgres) 권한으로 실행되어
-- party_members를 조회할 때 RLS를 다시 평가하지 않으므로 재귀가 끊긴다.
-- search_path를 고정하고, 실행 권한은 authenticated/anon에만 최소로 둔다(서버 쪽 service_role은
-- 이미 RLS를 완전히 우회하므로 이 함수가 필요 없다).
create or replace function public.is_party_member(p_party_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.party_members pm
    where pm.party_id = p_party_id
      and pm.profile_id = auth.uid()
      and pm.status = 'active'
  );
$$;

revoke all on function public.is_party_member(uuid) from public;
grant execute on function public.is_party_member(uuid) to anon, authenticated;

comment on function public.is_party_member(uuid) is
  '호출자가 해당 파티의 활성 멤버인지 확인. party_members/chat_rooms/chat_messages RLS에서 재귀 없이 "같은 파티 멤버끼리 서로 조회" 를 구현하기 위한 헬퍼.';

-- party_members: 같은 파티의 활성 멤버끼리 서로의 멤버십 행을 볼 수 있게 한다 (재귀 없음).
drop policy if exists party_members_select on public.party_members;
create policy party_members_select on public.party_members for select
  using (
    profile_id = auth.uid()
    or public.is_admin()
    or public.is_party_member(party_id)
  );

-- chat_rooms / chat_messages / chat_read_states도 같은 헬퍼로 정리한다.
drop policy if exists chat_rooms_select on public.chat_rooms;
create policy chat_rooms_select on public.chat_rooms for select
  using (public.is_party_member(chat_rooms.party_id) or public.is_admin());

drop policy if exists chat_messages_select on public.chat_messages;
create policy chat_messages_select on public.chat_messages for select
  using (
    exists (
      select 1 from public.chat_rooms cr
      where cr.id = chat_messages.chat_room_id
        and public.is_party_member(cr.party_id)
    )
  );

drop policy if exists chat_messages_insert on public.chat_messages;
create policy chat_messages_insert on public.chat_messages for insert
  with check (
    message_type = 'text'
    and sender_id = auth.uid()
    and exists (
      select 1 from public.chat_rooms cr
      where cr.id = chat_messages.chat_room_id
        and public.is_party_member(cr.party_id)
    )
  );

drop policy if exists chat_read_states_insert on public.chat_read_states;
create policy chat_read_states_insert on public.chat_read_states for insert
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from public.chat_rooms cr
      where cr.id = chat_read_states.chat_room_id
        and public.is_party_member(cr.party_id)
    )
  );
