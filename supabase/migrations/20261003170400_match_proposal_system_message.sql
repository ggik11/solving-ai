-- 수동 파티는 confirm_party에서 "팀이 확정되었어요" 시스템 메시지를 남기는데(4-A),
-- 빠른 매칭으로 생성된 팀(_finalize_match_proposal)은 같은 안내가 빠져 있었다 — E2E로
-- 실제 채팅방을 열어보다가 발견했다. 팀 생성 직후 한 줄만 추가한다.
create or replace function public._finalize_match_proposal(p_proposal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal record;
  v_party_id uuid;
  v_member record;
  v_slot_id uuid;
begin
  select * into v_proposal from public.match_proposals where id = p_proposal_id for update;
  if not found then
    raise exception 'PROPOSAL_NOT_FOUND: 제안을 찾을 수 없습니다.';
  end if;
  if v_proposal.status <> 'proposed' or v_proposal.party_id is not null then
    return;
  end if;

  for v_member in select profile_id from public.match_proposal_members where proposal_id = p_proposal_id order by profile_id loop
    perform public.lock_activity_membership(v_proposal.activity_id, v_member.profile_id);
  end loop;

  for v_member in select profile_id from public.match_proposal_members where proposal_id = p_proposal_id loop
    if exists (
      select 1 from public.party_members
      where activity_id = v_proposal.activity_id and profile_id = v_member.profile_id and status = 'active'
    ) then
      raise exception 'MEMBER_ALREADY_ACTIVE_IN_ACTIVITY: 팀원 중 한 명이 이미 이 활동의 다른 파티에서 활동 중입니다.';
    end if;
  end loop;

  insert into public.parties (activity_id, source, leader_id, title, capacity, status)
  values (
    v_proposal.activity_id, 'matching', v_proposal.proposed_leader_profile_id, '빠른 매칭 확정팀',
    (select count(*) from public.match_proposal_members where proposal_id = p_proposal_id), 'confirmed'
  )
  returning id into v_party_id;

  for v_member in
    select role_name, count(*) as cnt
    from public.match_proposal_members where proposal_id = p_proposal_id
    group by role_name
  loop
    insert into public.party_role_slots (party_id, role_name, capacity) values (v_party_id, v_member.role_name, v_member.cnt);
  end loop;

  for v_member in select profile_id, role_name, queue_id from public.match_proposal_members where proposal_id = p_proposal_id loop
    select id into v_slot_id from public.party_role_slots where party_id = v_party_id and role_name = v_member.role_name;

    insert into public.party_members (party_id, profile_id, role_slot_id, is_leader, status)
    values (v_party_id, v_member.profile_id, v_slot_id, v_member.profile_id = v_proposal.proposed_leader_profile_id, 'active');

    update public.matching_queue set status = 'matched' where id = v_member.queue_id;

    update public.party_applications
      set status = 'superseded', decided_at = now()
      where profile_id = v_member.profile_id and status = 'pending'
        and party_id in (select id from public.parties where activity_id = v_proposal.activity_id);

    perform public.create_notification(
      v_member.profile_id, 'match_proposal_matched', 'party', v_party_id,
      '매칭이 확정됐어요', '빠른 매칭 제안이 확정되어 팀 채팅방이 생성되었습니다.',
      'match_proposal_matched:' || p_proposal_id::text
    );
  end loop;

  perform public.insert_system_chat_message(v_party_id, '빠른 매칭으로 팀이 확정되었어요. 반갑게 인사해 보세요!');

  update public.match_proposals set status = 'matched', party_id = v_party_id where id = p_proposal_id;
end;
$$;
