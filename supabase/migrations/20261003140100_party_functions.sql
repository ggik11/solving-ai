-- 3단계: 파티 생성·지원·승인·거절·탈퇴·위임·해산·확정·재모집을 DB 함수(트랜잭션 + 행 잠금)로 구현한다
-- (architecture.md 4장 핵심 불변식, 5.1/5.2절, CLAUDE.md "상태 전이와 권한은 DB 함수에서 처리").
--
-- 설계 메모:
-- - 모든 함수는 SECURITY DEFINER + auth.uid() 기반 권한 체크를 직접 수행한다. 함수는 테이블
--   소유자 권한으로 실행되어 RLS를 우회하므로, 아래에서 parties/party_members/party_applications의
--   INSERT/UPDATE 정책을 "운영자만"으로 좁혀 일반 사용자는 반드시 이 함수들을 거치도록 강제한다
--   (raw 테이블 쓰기로 정원·빈도 제한·상태 전이 검증을 우회할 수 없게 함).
-- - 역할 슬롯(party_role_slots) 기반 세부 배정 UI는 이번 단계 범위 밖이라 apply/approve는
--   role_slot_id를 항상 null로 둔다(파티 전체 정원만 사용). 트리거(party_members_sync_slot_count)는
--   role_slot_id가 null이면 그냥 아무 일도 하지 않으므로 안전하다.
-- - 에러는 'CODE: 설명' 형식의 메시지로 raise한다. 클라이언트는 콜론 앞부분을 기계가 읽을 코드로 쓴다.

-- ---------------------------------------------------------------------------
-- RLS 강화: 일반 사용자는 parties/party_members/party_applications를 직접 쓸 수 없다.
-- (아래 함수들이 SECURITY DEFINER로 우회해 실제 쓰기를 수행한다.)
-- ---------------------------------------------------------------------------
drop policy if exists parties_insert on public.parties;
create policy parties_insert on public.parties for insert with check (public.is_admin());

drop policy if exists parties_update on public.parties;
create policy parties_update on public.parties for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists party_members_insert on public.party_members;
create policy party_members_insert on public.party_members for insert with check (public.is_admin());

drop policy if exists party_members_update on public.party_members;
create policy party_members_update on public.party_members for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists party_applications_insert on public.party_applications;
create policy party_applications_insert on public.party_applications for insert with check (public.is_admin());

drop policy if exists party_applications_update on public.party_applications;
create policy party_applications_update on public.party_applications for update using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 빈도 제한 설정값 (지시서/요청: "빈도 제한")
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value, description) values
  ('party_rate_limits', '{"create_party_per_day": 5, "apply_per_hour": 10}'::jsonb,
   '파티 생성/지원 빈도 제한(스팸 방지). 하루/시간당 허용 횟수.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 알림 생성 헬퍼 (dedupe_key로 중복 발송 방지). 외부에 공개하지 않는다(authenticated/anon grant 없음) —
-- 아래 SECURITY DEFINER 함수들이 테이블 소유자 권한으로 내부 호출하므로 grant가 없어도 동작한다.
-- ---------------------------------------------------------------------------
create or replace function public.create_notification(
  p_profile_id uuid,
  p_type text,
  p_target_type text,
  p_target_id uuid,
  p_title text,
  p_body text,
  p_dedupe_key text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (profile_id, type, target_type, target_id, title, body, dedupe_key)
  values (p_profile_id, p_type, p_target_type, p_target_id, p_title, p_body, p_dedupe_key)
  on conflict (profile_id, dedupe_key) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. 파티 생성
-- ---------------------------------------------------------------------------
create or replace function public.create_party(
  p_activity_id uuid,
  p_title text,
  p_description text,
  p_capacity smallint,
  p_meeting_mode text,
  p_recruit_deadline timestamptz
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity record;
  v_party_id uuid;
  v_created_today int;
  v_limit_per_day int;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: 로그인이 필요합니다.';
  end if;
  if p_capacity is null or p_capacity < 1 then
    raise exception 'INVALID_CAPACITY: 정원은 1명 이상이어야 합니다.';
  end if;

  select status, participation_mode into v_activity from public.activities where id = p_activity_id;
  if not found then
    raise exception 'ACTIVITY_NOT_FOUND: 활동을 찾을 수 없습니다.';
  end if;
  if v_activity.status <> 'published' then
    raise exception 'ACTIVITY_NOT_AVAILABLE: 공개된 활동이 아닙니다.';
  end if;
  if v_activity.participation_mode = 'solo' then
    raise exception 'ACTIVITY_SOLO_ONLY: 개인 참여만 가능한 활동에는 파티를 만들 수 없습니다.';
  end if;

  select coalesce((value ->> 'create_party_per_day')::int, 5) into v_limit_per_day
    from public.app_settings where key = 'party_rate_limits';
  v_limit_per_day := coalesce(v_limit_per_day, 5);

  select count(*) into v_created_today from public.parties
    where leader_id = auth.uid() and source = 'manual' and created_at > now() - interval '1 day';
  if v_created_today >= v_limit_per_day then
    raise exception 'RATE_LIMITED: 하루에 만들 수 있는 파티 수(%)를 초과했습니다.', v_limit_per_day;
  end if;

  insert into public.parties (activity_id, source, leader_id, title, description, capacity, meeting_mode, recruit_deadline, status)
  values (
    p_activity_id, 'manual', auth.uid(),
    nullif(trim(p_title), ''), nullif(trim(p_description), ''),
    p_capacity, p_meeting_mode, p_recruit_deadline, 'recruiting'
  )
  returning id into v_party_id;

  insert into public.party_members (party_id, profile_id, is_leader, status)
  values (v_party_id, auth.uid(), true, 'active');

  return v_party_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. 파티 지원
-- ---------------------------------------------------------------------------
create or replace function public.apply_to_party(p_party_id uuid, p_message text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_party record;
  v_applied_this_hour int;
  v_limit_per_hour int;
  v_application_id uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: 로그인이 필요합니다.';
  end if;

  select * into v_party from public.parties where id = p_party_id;
  if not found then
    raise exception 'PARTY_NOT_FOUND: 파티를 찾을 수 없습니다.';
  end if;
  if v_party.status <> 'recruiting' then
    raise exception 'PARTY_NOT_RECRUITING: 모집 중인 파티가 아닙니다.';
  end if;
  if v_party.leader_id = auth.uid() then
    raise exception 'ALREADY_LEADER: 이미 이 파티의 팀장입니다.';
  end if;
  if exists (
    select 1 from public.party_members
    where party_id = p_party_id and profile_id = auth.uid() and status = 'active'
  ) then
    raise exception 'ALREADY_MEMBER: 이미 이 파티의 멤버입니다.';
  end if;
  if exists (
    select 1 from public.party_applications
    where party_id = p_party_id and profile_id = auth.uid() and status = 'pending'
  ) then
    raise exception 'ALREADY_APPLIED: 이미 대기 중인 지원이 있습니다.';
  end if;

  select coalesce((value ->> 'apply_per_hour')::int, 10) into v_limit_per_hour
    from public.app_settings where key = 'party_rate_limits';
  v_limit_per_hour := coalesce(v_limit_per_hour, 10);

  select count(*) into v_applied_this_hour from public.party_applications
    where profile_id = auth.uid() and created_at > now() - interval '1 hour';
  if v_applied_this_hour >= v_limit_per_hour then
    raise exception 'RATE_LIMITED: 시간당 지원 가능 횟수(%)를 초과했습니다.', v_limit_per_hour;
  end if;

  insert into public.party_applications (party_id, profile_id, message, status)
  values (p_party_id, auth.uid(), nullif(trim(p_message), ''), 'pending')
  returning id into v_application_id;

  perform public.create_notification(
    v_party.leader_id, 'party_application_received', 'party', p_party_id,
    '새 지원이 도착했어요', coalesce(v_party.title, '파티') || '에 새 지원이 도착했습니다.',
    'party_application_received:' || v_application_id::text
  );

  return v_application_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. 지원 취소 (지원자 본인)
-- ---------------------------------------------------------------------------
create or replace function public.cancel_application(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app record;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: 로그인이 필요합니다.';
  end if;

  select * into v_app from public.party_applications where id = p_application_id;
  if not found then
    raise exception 'APPLICATION_NOT_FOUND: 지원 내역을 찾을 수 없습니다.';
  end if;
  if v_app.profile_id <> auth.uid() then
    raise exception 'NOT_APPLICANT: 본인의 지원만 취소할 수 있습니다.';
  end if;
  if v_app.status <> 'pending' then
    raise exception 'APPLICATION_NOT_PENDING: 이미 처리된 지원입니다.';
  end if;

  update public.party_applications set status = 'cancelled', decided_at = now() where id = p_application_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. 지원 승인 (팀장) — 마지막 자리 동시 승인은 parties 행 잠금으로 직렬화한다 (4장 핵심 불변식 2).
-- ---------------------------------------------------------------------------
create or replace function public.approve_application(p_application_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app record;
  v_party record;
  v_active_count int;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: 로그인이 필요합니다.';
  end if;

  select * into v_app from public.party_applications where id = p_application_id for update;
  if not found then
    raise exception 'APPLICATION_NOT_FOUND: 지원 내역을 찾을 수 없습니다.';
  end if;
  if v_app.status <> 'pending' then
    raise exception 'APPLICATION_NOT_PENDING: 이미 처리된 지원입니다.';
  end if;

  -- parties 행 잠금: 이 파티에 대한 동시 승인 요청을 여기서 직렬화한다.
  select * into v_party from public.parties where id = v_app.party_id for update;
  if v_party.leader_id <> auth.uid() and not public.is_admin() then
    raise exception 'NOT_LEADER: 파티장만 지원을 승인할 수 있습니다.';
  end if;
  if v_party.status not in ('recruiting', 'full') then
    raise exception 'PARTY_NOT_RECRUITING: 모집 중인 파티가 아닙니다.';
  end if;

  select count(*) into v_active_count from public.party_members
    where party_id = v_party.id and status = 'active';
  if v_active_count >= v_party.capacity then
    raise exception 'PARTY_FULL: 파티 정원이 가득 찼습니다.';
  end if;

  insert into public.party_members (party_id, profile_id, is_leader, status)
  values (v_party.id, v_app.profile_id, false, 'active');

  update public.party_applications set status = 'approved', decided_at = now() where id = p_application_id;

  if v_active_count + 1 >= v_party.capacity then
    update public.parties set status = 'full' where id = v_party.id and status = 'recruiting';
  end if;

  perform public.create_notification(
    v_app.profile_id, 'party_application_approved', 'party', v_party.id,
    '파티 지원이 승인되었어요', coalesce(v_party.title, '파티') || ' 지원이 승인되었습니다.',
    'party_application_approved:' || p_application_id::text
  );

  return v_party.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. 지원 거절 (팀장)
-- ---------------------------------------------------------------------------
create or replace function public.reject_application(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app record;
  v_party record;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: 로그인이 필요합니다.';
  end if;

  select * into v_app from public.party_applications where id = p_application_id;
  if not found then
    raise exception 'APPLICATION_NOT_FOUND: 지원 내역을 찾을 수 없습니다.';
  end if;
  if v_app.status <> 'pending' then
    raise exception 'APPLICATION_NOT_PENDING: 이미 처리된 지원입니다.';
  end if;

  select * into v_party from public.parties where id = v_app.party_id;
  if v_party.leader_id <> auth.uid() and not public.is_admin() then
    raise exception 'NOT_LEADER: 파티장만 지원을 거절할 수 있습니다.';
  end if;

  update public.party_applications set status = 'rejected', decided_at = now() where id = p_application_id;

  perform public.create_notification(
    v_app.profile_id, 'party_application_rejected', 'party', v_app.party_id,
    '파티 지원이 거절되었어요', coalesce(v_party.title, '파티') || ' 지원이 거절되었습니다.',
    'party_application_rejected:' || p_application_id::text
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. 탈퇴 — 팀장은 다른 멤버가 있으면 먼저 위임해야 한다. 혼자 남은 팀장의 탈퇴는 해산으로 처리한다.
-- ---------------------------------------------------------------------------
create or replace function public.leave_party(p_party_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_party record;
  v_member record;
  v_other_active_count int;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: 로그인이 필요합니다.';
  end if;

  select * into v_party from public.parties where id = p_party_id for update;
  if not found then
    raise exception 'PARTY_NOT_FOUND: 파티를 찾을 수 없습니다.';
  end if;

  select * into v_member from public.party_members
    where party_id = p_party_id and profile_id = auth.uid() and status = 'active';
  if not found then
    raise exception 'NOT_A_MEMBER: 이 파티의 멤버가 아닙니다.';
  end if;

  if v_member.is_leader then
    select count(*) into v_other_active_count from public.party_members
      where party_id = p_party_id and status = 'active' and profile_id <> auth.uid();
    if v_other_active_count > 0 then
      raise exception 'LEADER_MUST_DELEGATE: 다른 팀원이 있을 때는 팀장을 위임한 뒤 탈퇴할 수 있습니다.';
    end if;

    update public.party_members set status = 'left' where id = v_member.id;
    update public.party_applications set status = 'rejected', decided_at = now()
      where party_id = p_party_id and status = 'pending';
    update public.parties set status = 'cancelled' where id = p_party_id;
    return;
  end if;

  update public.party_members set status = 'left' where id = v_member.id;

  perform public.create_notification(
    v_party.leader_id, 'party_member_left', 'party', p_party_id,
    '팀원이 탈퇴했어요', '파티에서 팀원 한 명이 탈퇴했습니다.',
    'party_member_left:' || v_member.id::text
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. 팀장 위임
-- ---------------------------------------------------------------------------
create or replace function public.delegate_leader(p_party_id uuid, p_new_leader_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_party record;
  v_new_leader_member record;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: 로그인이 필요합니다.';
  end if;

  select * into v_party from public.parties where id = p_party_id for update;
  if not found then
    raise exception 'PARTY_NOT_FOUND: 파티를 찾을 수 없습니다.';
  end if;
  if v_party.leader_id <> auth.uid() and not public.is_admin() then
    raise exception 'NOT_LEADER: 파티장만 위임할 수 있습니다.';
  end if;
  if v_party.status in ('cancelled', 'completed') then
    raise exception 'PARTY_INACTIVE: 종료된 파티입니다.';
  end if;
  if p_new_leader_profile_id = v_party.leader_id then
    raise exception 'ALREADY_LEADER: 이미 팀장입니다.';
  end if;

  select * into v_new_leader_member from public.party_members
    where party_id = p_party_id and profile_id = p_new_leader_profile_id and status = 'active';
  if not found then
    raise exception 'NOT_A_MEMBER: 새 팀장은 이 파티의 활성 멤버여야 합니다.';
  end if;

  update public.party_members set is_leader = false
    where party_id = p_party_id and profile_id = v_party.leader_id;
  update public.party_members set is_leader = true where id = v_new_leader_member.id;
  update public.parties set leader_id = p_new_leader_profile_id where id = p_party_id;

  perform public.create_notification(
    p_new_leader_profile_id, 'party_leader_delegated', 'party', p_party_id,
    '팀장이 되었어요', '파티장 권한을 위임받았습니다.',
    'party_leader_delegated:' || p_party_id::text || ':' || p_new_leader_profile_id::text
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. 해산 (팀장)
-- ---------------------------------------------------------------------------
create or replace function public.disband_party(p_party_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_party record;
  v_member_id uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: 로그인이 필요합니다.';
  end if;

  select * into v_party from public.parties where id = p_party_id for update;
  if not found then
    raise exception 'PARTY_NOT_FOUND: 파티를 찾을 수 없습니다.';
  end if;
  if v_party.leader_id <> auth.uid() and not public.is_admin() then
    raise exception 'NOT_LEADER: 파티장만 해산할 수 있습니다.';
  end if;
  if v_party.status in ('cancelled', 'completed') then
    raise exception 'PARTY_ALREADY_INACTIVE: 이미 종료된 파티입니다.';
  end if;

  for v_member_id in
    select profile_id from public.party_members where party_id = p_party_id and status = 'active'
  loop
    perform public.create_notification(
      v_member_id, 'party_disbanded', 'party', p_party_id,
      '파티가 해산됐어요', coalesce(v_party.title, '파티') || '가 해산되었습니다.',
      'party_disbanded:' || p_party_id::text || ':' || v_member_id::text
    );
  end loop;

  update public.party_members set status = 'left' where party_id = p_party_id and status = 'active';
  update public.party_applications set status = 'rejected', decided_at = now()
    where party_id = p_party_id and status = 'pending';
  update public.parties set status = 'cancelled' where id = p_party_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. 확정 (팀장) — 동일 사용자가 동시에 다른 파티에서도 확정되는 경쟁 상황을
-- party_members_one_confirmed_per_activity 유니크 인덱스로 직렬화하고, 패배한 쪽은 그 파티에서
-- 자동으로 제외(removed)한 뒤 알림을 보낸다. 승리한 멤버의 "동일 활동" 다른 pending 지원은
-- superseded로 정리한다 (4장 핵심 불변식 1, 5.2절).
-- ---------------------------------------------------------------------------
create or replace function public.confirm_party(p_party_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_party record;
  v_member record;
  v_removed_profiles uuid[] := '{}';
  v_remaining_active int;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: 로그인이 필요합니다.';
  end if;

  select * into v_party from public.parties where id = p_party_id for update;
  if not found then
    raise exception 'PARTY_NOT_FOUND: 파티를 찾을 수 없습니다.';
  end if;
  if v_party.leader_id <> auth.uid() and not public.is_admin() then
    raise exception 'NOT_LEADER: 파티장만 확정할 수 있습니다.';
  end if;
  if v_party.status not in ('recruiting', 'full') then
    raise exception 'PARTY_NOT_CONFIRMABLE: 모집 중이거나 정원이 찬 파티만 확정할 수 있습니다.';
  end if;

  for v_member in
    select * from public.party_members
    where party_id = p_party_id and status = 'active'
    order by joined_at
  loop
    begin
      update public.party_members set is_confirmed = true where id = v_member.id;
    exception when unique_violation then
      update public.party_members set status = 'removed' where id = v_member.id;
      v_removed_profiles := array_append(v_removed_profiles, v_member.profile_id);
      perform public.create_notification(
        v_member.profile_id, 'party_membership_removed_conflict', 'party', p_party_id,
        '다른 파티에서 이미 확정되어 제외되었어요',
        '같은 활동의 다른 파티가 먼저 확정되어 이 파티에서는 자동으로 제외되었습니다.',
        'party_membership_removed_conflict:' || v_member.id::text
      );
      continue;
    end;

    -- 승리: 같은 활동의 다른 파티에 남아있던 이 사용자의 대기 중 지원을 자동 정리한다.
    update public.party_applications
      set status = 'superseded', decided_at = now()
      where profile_id = v_member.profile_id
        and status = 'pending'
        and party_id in (select id from public.parties where activity_id = v_party.activity_id and id <> p_party_id);

    perform public.create_notification(
      v_member.profile_id, 'party_confirmed', 'party', p_party_id,
      '파티가 확정되었어요', coalesce(v_party.title, '파티') || ' 팀이 확정되었습니다.',
      'party_confirmed:' || v_member.id::text
    );
  end loop;

  select count(*) into v_remaining_active from public.party_members
    where party_id = p_party_id and status = 'active';
  if v_remaining_active = 0 then
    raise exception 'PARTY_CONFIRM_NO_MEMBERS: 모든 멤버가 다른 파티에 이미 확정되어 있어 확정할 수 없습니다.';
  end if;

  -- 확정 시점에 남아있는 대기 지원은 더 이상 받지 않는다(파티가 모집을 종료했으므로).
  update public.party_applications
    set status = 'rejected', decided_at = now()
    where party_id = p_party_id and status = 'pending';

  -- parties.status -> confirmed 전환은 기존 트리거(parties_sync_confirmed_members)가
  -- 남은 active 멤버의 is_confirmed를 다시 한 번 true로 맞춘다(이미 true라 멱등적).
  update public.parties set status = 'confirmed' where id = p_party_id;

  return jsonb_build_object('removed_due_to_conflict', to_jsonb(v_removed_profiles));
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. 재모집 (팀장) — full -> recruiting
-- ---------------------------------------------------------------------------
create or replace function public.reopen_party(p_party_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_party record;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: 로그인이 필요합니다.';
  end if;

  select * into v_party from public.parties where id = p_party_id for update;
  if not found then
    raise exception 'PARTY_NOT_FOUND: 파티를 찾을 수 없습니다.';
  end if;
  if v_party.leader_id <> auth.uid() and not public.is_admin() then
    raise exception 'NOT_LEADER: 파티장만 재모집을 시작할 수 있습니다.';
  end if;
  if v_party.status <> 'full' then
    raise exception 'PARTY_NOT_FULL: 정원이 찬 파티만 재모집을 시작할 수 있습니다.';
  end if;

  update public.parties set status = 'recruiting' where id = p_party_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 권한 정리: anon에게는 아무것도 허용하지 않고, authenticated에게만 실행 권한을 준다.
-- (CREATE FUNCTION은 기본적으로 PUBLIC에 EXECUTE를 부여하므로 명시적으로 걷어낸다.)
-- ---------------------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'create_party(uuid, text, text, smallint, text, timestamptz)',
    'apply_to_party(uuid, text)',
    'cancel_application(uuid)',
    'approve_application(uuid)',
    'reject_application(uuid)',
    'leave_party(uuid)',
    'delegate_leader(uuid, uuid)',
    'disband_party(uuid)',
    'confirm_party(uuid)',
    'reopen_party(uuid)'
  ]
  loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end;
$$;

revoke all on function public.create_notification(uuid, text, text, uuid, text, text, text) from public;
