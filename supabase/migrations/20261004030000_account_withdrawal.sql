-- 5-A단계(회원 탈퇴): 프로필 비식별화, 대기열·제안·지원 정리, 팀장이면 위임·해산을 먼저
-- 안내한다. auth.users 행은 지우지 않는다(소프트 탈퇴) — profiles.account_status가 2단계부터
-- 'withdrawn'을 지원하고 있었고, 채팅 시스템 메시지("~님이 합류/탈퇴했어요")와 이력(파티/
-- 매칭) 조회가 여전히 그 profiles 행을 참조하므로, 행을 지우면 "탈퇴한 사용자"로 표시할 방법이
-- 없어진다. 닉네임을 '탈퇴한 사용자'로 바꾸면 nickname을 조인해 보여주는 모든 화면(채팅 멤버
-- 목록, 파티 멤버 목록 등)에 자동으로 반영된다 — 별도 "작성자 표시" 로직이 필요 없다.

-- _enforce_active_account 트리거 보강: 탈퇴 자체는 suspended 계정도 할 수 있어야 하는데(탈퇴는
-- "이 서비스를 떠나겠다"는 의사표시이지 추가 권한이 아니다), withdraw_account() 내부의 정리
-- 작업(매칭 대기열 취소, 파티 지원 취소, 파티 탈퇴)이 바로 그 트리거가 보호하는 테이블들을
-- 건드린다 — 자기 자신의 계정 상태 때문에 자기 자신의 탈퇴 처리가 막히는 문제가 생긴다.
-- 트랜잭션 로컬 GUC로 "지금은 withdraw_account()가 자기 정리 중"임을 표시해 그 안에서만
-- 트리거를 통과시킨다(바깥에서는 여전히 강제됨 — 세션이 아니라 트랜잭션 범위라 자동으로 풀린다).
create or replace function public._enforce_active_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('app.withdrawing', true), '') = 'true' then
    return new;
  end if;
  perform public._require_active_profile(auth.uid());
  return new;
end;
$$;

-- 닉네임 유니크 인덱스(2-B, lower(nickname))는 활성 사용자 간 중복만 막으면 된다. 탈퇴자를
-- 모두 같은 "탈퇴한 사용자" 닉네임으로 비식별화하면 둘째 탈퇴자부터 유니크 제약에 걸리므로,
-- withdrawn 계정은 이 제약에서 제외하도록 부분 인덱스로 바꾼다.
drop index if exists public.profiles_nickname_key;
create unique index profiles_nickname_key on public.profiles (lower(nickname)) where account_status <> 'withdrawn';

create or replace function public.withdraw_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := auth.uid();
  v_current_status text;
  v_blocking_party record;
  v_member record;
  v_proposal_id uuid;
begin
  if v_profile_id is null then
    raise exception 'NOT_AUTHENTICATED: 로그인이 필요합니다.';
  end if;

  select account_status into v_current_status from public.profiles where id = v_profile_id;
  if v_current_status = 'withdrawn' then
    raise exception 'ALREADY_WITHDRAWN: 이미 탈퇴한 계정입니다.';
  end if;

  -- 아래 정리 작업이 _enforce_active_account 트리거에 막히지 않도록(정지된 계정도 탈퇴는 할 수
  -- 있어야 한다) 이 트랜잭션 동안만 우회 플래그를 켠다.
  perform set_config('app.withdrawing', 'true', true);

  -- 팀장으로 있는 파티 중 다른 활성 멤버가 있는 파티가 있으면 탈퇴를 막는다 — 먼저 위임하거나
  -- 해산하도록 안내한다(요청: "팀장이면 먼저 위임이나 해산을 하도록 안내").
  select p.id, p.title into v_blocking_party
  from public.party_members pm
  join public.parties p on p.id = pm.party_id
  where pm.profile_id = v_profile_id and pm.status = 'active' and pm.is_leader = true
    and exists (
      select 1 from public.party_members pm2
      where pm2.party_id = pm.party_id and pm2.status = 'active' and pm2.profile_id <> v_profile_id
    )
  limit 1;
  if found then
    raise exception 'LEADER_MUST_RESOLVE_PARTY_FIRST: 팀장으로 있는 파티(%)가 있어요. 먼저 팀장을 위임하거나 파티를 해산한 뒤 탈퇴할 수 있습니다.', coalesce(v_blocking_party.title, '제목 없음');
  end if;

  -- 진행 중인 매칭 제안에서 빠진다 — 다른 멤버는 _release_match_proposal이 continue_on_fail에
  -- 따라 재대기/취소 처리한다(거절과 동일한 경로). 탈퇴자 본인의 대기열은 바로 아래에서 다시
  -- 한번 확실히 취소한다(continue_on_fail=true였다면 release가 waiting으로 되돌릴 수 있으므로).
  for v_proposal_id in
    select distinct mpm.proposal_id
    from public.match_proposal_members mpm
    join public.match_proposals mp on mp.id = mpm.proposal_id
    where mpm.profile_id = v_profile_id and mp.status = 'proposed'
  loop
    perform public._release_match_proposal(v_proposal_id, 'cancelled');
  end loop;

  update public.matching_queue set status = 'cancelled'
    where profile_id = v_profile_id and status in ('waiting', 'proposed');

  -- 대기 중인 파티 지원을 취소한다.
  update public.party_applications set status = 'cancelled', decided_at = now()
    where profile_id = v_profile_id and status = 'pending';

  -- 남은 활성 파티 멤버십을 정리한다(팀원이거나, 혼자 남은 팀장인 파티는 해산 — leave_party와
  -- 같은 규칙). 위에서 "다른 멤버가 있는 팀장"은 이미 걸렀으므로 여기 남는 팀장은 항상 혼자다.
  for v_member in
    select pm.id as member_id, pm.party_id, pm.is_leader
    from public.party_members pm
    where pm.profile_id = v_profile_id and pm.status = 'active'
  loop
    update public.party_members set status = 'left' where id = v_member.member_id;
    perform public.insert_system_chat_message(v_member.party_id, '탈퇴한 사용자님이 파티를 탈퇴했어요.');

    if v_member.is_leader then
      update public.party_applications set status = 'rejected', decided_at = now()
        where party_id = v_member.party_id and status = 'pending';
      update public.parties set status = 'cancelled' where id = v_member.party_id;
    end if;
  end loop;

  -- 프로필 비식별화: 닉네임을 "탈퇴한 사용자"로 바꾼다(채팅·파티 멤버 목록 등 nickname을
  -- 조인하는 모든 화면에 자동 반영됨). 자기소개·포트폴리오 링크 등 선택 정보를 지운다.
  update public.profiles set
    nickname = '탈퇴한 사용자',
    bio = null,
    portfolio_url = null,
    preferred_location_type = null,
    preferred_region = null,
    weekly_available_hours = null,
    experience = null,
    matching_opt_in = false,
    notifications_enabled = false,
    account_status = 'withdrawn'
  where id = v_profile_id;

  delete from public.profile_majors where profile_id = v_profile_id;
  delete from public.profile_interests where profile_id = v_profile_id;
  delete from public.profile_skills where profile_id = v_profile_id;
  delete from public.profile_preferred_activity_types where profile_id = v_profile_id;
  delete from public.availability_slots where profile_id = v_profile_id;
end;
$$;

revoke all on function public.withdraw_account() from public;
grant execute on function public.withdraw_account() to authenticated;
