-- 3단계 보완 (지시서 7장 A 필수 요구사항):
--   1. 역할 슬롯을 파티 생성/지원/승인 경로에 실제로 연결한다(지금까지는 테이블만 있고 비워뒀음).
--   2. "활동당 확정 팀 1개" 불변식을 "활동당 활성 멤버(승인된 멤버) 1파티"로 더 일찍(승인 시점) 강제한다.
--   3. 팀장이 파티 정보(제목/소개/모임방식/모집마감/공통시간/역할별 정원)를 수정하는 함수.
--
-- 설계 메모(동시성): 두 함수(create_party/approve_application) 모두 "같은 활동 + 같은 사용자" 조합에 대해
-- advisory lock(lock_activity_membership)을 다른 어떤 행 잠금(application/party/role_slot FOR UPDATE)보다
-- *먼저* 획득한다. 그래야 "사용자 X가 같은 활동의 두 파티에 동시에 승인되는" 경쟁에서, 서로 다른 행을
-- 잠근 두 트랜잭션이 서로를 기다리며 교착(deadlock)에 빠지는 상황을 원천적으로 피할 수 있다. 같은 파티
-- 안에서의 동시 승인(마지막 역할 슬롯 경쟁)은 기존처럼 parties 행 FOR UPDATE 잠금이 직렬화한다.

-- ---------------------------------------------------------------------------
-- 0. 활동당 유니크 인덱스: confirmed 기준 -> 활성 멤버(status='active') 기준.
--    승인 시점(approve_application)에 이미 활동당 1파티를 강제하므로, confirm_party는 더 이상
--    "같은 활동 다른 파티에 이미 확정됨" 충돌을 처리할 필요가 없다(아래 confirm_party 재정의 참고).
-- ---------------------------------------------------------------------------
drop index if exists public.party_members_one_confirmed_per_activity;

create unique index party_members_one_active_per_activity
  on public.party_members (activity_id, profile_id)
  where status = 'active';

comment on index public.party_members_one_active_per_activity is
  '같은 활동에서는 활성 멤버(승인된 멤버)가 한 파티에만 있을 수 있다. confirmed 여부와 무관 — approve_application/create_party에서 강제 (3단계 보완).';

-- ---------------------------------------------------------------------------
-- 1. 활동+사용자 단위 직렬화 헬퍼
-- ---------------------------------------------------------------------------
create or replace function public.lock_activity_membership(p_activity_id uuid, p_profile_id uuid)
returns void
language plpgsql
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_activity_id::text || ':' || p_profile_id::text, 0));
end;
$$;

revoke all on function public.lock_activity_membership(uuid, uuid) from public;

-- ---------------------------------------------------------------------------
-- party_role_slots 쓰기도 함수 경유로 강제한다(일반 사용자가 직접 UPDATE해 filled_count/capacity
-- 검증을 우회하지 못하도록). parties/party_members/party_applications는 이미 20261003140100에서 좁혔다.
-- ---------------------------------------------------------------------------
drop policy if exists party_role_slots_insert on public.party_role_slots;
create policy party_role_slots_insert on public.party_role_slots for insert with check (public.is_admin());

drop policy if exists party_role_slots_update on public.party_role_slots;
create policy party_role_slots_update on public.party_role_slots for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists party_role_slots_delete on public.party_role_slots;
create policy party_role_slots_delete on public.party_role_slots for delete using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. 파티 생성 — 역할 슬롯 입력 필수. 팀장도 역할 슬롯 하나를 차지하고, 슬롯 정원 합계가 파티 정원이 된다.
--    p_role_slots 형식: [{"role_name": "기획", "capacity": 1}, {"role_name": "개발", "capacity": 2}, ...]
-- ---------------------------------------------------------------------------
drop function if exists public.create_party(uuid, text, text, smallint, text, timestamptz);

create or replace function public.create_party(
  p_activity_id uuid,
  p_title text,
  p_description text,
  p_meeting_mode text,
  p_recruit_deadline timestamptz,
  p_role_slots jsonb,
  p_leader_role_name text
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
  v_slot jsonb;
  v_role_name text;
  v_role_capacity smallint;
  v_total_capacity smallint := 0;
  v_leader_slot_id uuid;
  v_inserted_slot_id uuid;
  v_seen_roles text[] := '{}';
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: 로그인이 필요합니다.';
  end if;

  if p_role_slots is null or jsonb_typeof(p_role_slots) <> 'array' or jsonb_array_length(p_role_slots) = 0 then
    raise exception 'INVALID_ROLE_SLOTS: 역할별 인원을 한 개 이상 입력해야 합니다.';
  end if;
  if p_leader_role_name is null or trim(p_leader_role_name) = '' then
    raise exception 'INVALID_LEADER_ROLE: 팀장이 맡을 역할을 선택해야 합니다.';
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

  -- 역할 슬롯 입력 검증 + 총 정원 계산 (행을 만들기 전에 먼저 검증)
  for v_slot in select * from jsonb_array_elements(p_role_slots)
  loop
    v_role_name := nullif(trim(v_slot ->> 'role_name'), '');
    v_role_capacity := (v_slot ->> 'capacity')::smallint;
    if v_role_name is null then
      raise exception 'INVALID_ROLE_SLOTS: 역할 이름을 입력해야 합니다.';
    end if;
    if v_role_capacity is null or v_role_capacity < 1 then
      raise exception 'INVALID_ROLE_SLOTS: %의 인원은 1명 이상이어야 합니다.', v_role_name;
    end if;
    if v_role_name = any(v_seen_roles) then
      raise exception 'INVALID_ROLE_SLOTS: 역할 이름(%)이 중복되었습니다.', v_role_name;
    end if;
    v_seen_roles := array_append(v_seen_roles, v_role_name);
    v_total_capacity := v_total_capacity + v_role_capacity;
  end loop;

  if not (trim(p_leader_role_name) = any(v_seen_roles)) then
    raise exception 'INVALID_LEADER_ROLE: 팀장 역할(%)이 역할 목록에 없습니다.', p_leader_role_name;
  end if;

  -- 활동당 활성 멤버 1파티: 팀장 본인도 즉시 활성 멤버가 되므로 생성 시점에 검사한다.
  perform public.lock_activity_membership(p_activity_id, auth.uid());
  if exists (
    select 1 from public.party_members
    where activity_id = p_activity_id and profile_id = auth.uid() and status = 'active'
  ) then
    raise exception 'ALREADY_ACTIVE_IN_ACTIVITY: 이미 이 활동의 다른 파티에서 활동 중입니다.';
  end if;

  insert into public.parties (activity_id, source, leader_id, title, description, capacity, meeting_mode, recruit_deadline, status)
  values (
    p_activity_id, 'manual', auth.uid(),
    nullif(trim(p_title), ''), nullif(trim(p_description), ''),
    v_total_capacity, p_meeting_mode, p_recruit_deadline, 'recruiting'
  )
  returning id into v_party_id;

  for v_slot in select * from jsonb_array_elements(p_role_slots)
  loop
    v_role_name := trim(v_slot ->> 'role_name');
    v_role_capacity := (v_slot ->> 'capacity')::smallint;
    insert into public.party_role_slots (party_id, role_name, capacity)
    values (v_party_id, v_role_name, v_role_capacity)
    returning id into v_inserted_slot_id;
    if v_role_name = trim(p_leader_role_name) then
      v_leader_slot_id := v_inserted_slot_id;
    end if;
  end loop;

  insert into public.party_members (party_id, profile_id, is_leader, status, role_slot_id)
  values (v_party_id, auth.uid(), true, 'active', v_leader_slot_id);

  return v_party_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. 파티 지원 — 역할 선택 필수. 빈 슬롯이 있는 역할만 신청 가능(최종 정원 검증은 승인 시점).
-- ---------------------------------------------------------------------------
drop function if exists public.apply_to_party(uuid, text);

create or replace function public.apply_to_party(p_party_id uuid, p_role_slot_id uuid, p_message text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_party record;
  v_slot record;
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

  if p_role_slot_id is null then
    raise exception 'ROLE_SLOT_REQUIRED: 지원할 역할을 선택해야 합니다.';
  end if;
  select * into v_slot from public.party_role_slots where id = p_role_slot_id and party_id = p_party_id;
  if not found then
    raise exception 'ROLE_SLOT_NOT_FOUND: 선택한 역할을 찾을 수 없습니다.';
  end if;
  if v_slot.filled_count >= v_slot.capacity then
    raise exception 'ROLE_SLOT_FULL: 선택한 역할(%)은 이미 정원이 찼습니다.', v_slot.role_name;
  end if;

  if exists (
    select 1 from public.party_members
    where party_id = p_party_id and profile_id = auth.uid() and status = 'active'
  ) then
    raise exception 'ALREADY_MEMBER: 이미 이 파티의 멤버입니다.';
  end if;
  if exists (
    select 1 from public.party_members
    where activity_id = v_party.activity_id and profile_id = auth.uid() and status = 'active'
  ) then
    raise exception 'ALREADY_ACTIVE_IN_ACTIVITY: 이미 이 활동의 다른 파티에서 활동 중입니다.';
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

  insert into public.party_applications (party_id, profile_id, role_slot_id, message, status)
  values (p_party_id, auth.uid(), p_role_slot_id, nullif(trim(p_message), ''), 'pending')
  returning id into v_application_id;

  perform public.create_notification(
    v_party.leader_id, 'party_application_received', 'party', p_party_id,
    '새 지원이 도착했어요',
    coalesce(v_party.title, '파티') || '에 ' || v_slot.role_name || ' 역할로 새 지원이 도착했습니다.',
    'party_application_received:' || v_application_id::text
  );

  return v_application_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. 지원 승인 — role_slot_id(지원서에 저장된 값)의 정원을 행 잠금으로 검사하고, 지원자가 이미 같은
--    활동의 다른 파티에서 활성 멤버라면 거부한다. 승인되는 즉시 같은 활동의 다른 대기 지원은 superseded.
-- ---------------------------------------------------------------------------
create or replace function public.approve_application(p_application_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_peek record;
  v_app record;
  v_party record;
  v_slot record;
  v_active_count int;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: 로그인이 필요합니다.';
  end if;

  -- 행 잠금 없이 먼저 활동/지원자를 식별한다 — advisory lock을 다른 어떤 FOR UPDATE보다
  -- 먼저 걸기 위함이다(동시에 다른 파티를 승인하는 두 트랜잭션이 서로의 행을 잠그며
  -- 교착하는 상황을 피한다. 위 파일 상단 설계 메모 참고).
  select pa.profile_id, p.activity_id
    into v_peek
    from public.party_applications pa
    join public.parties p on p.id = pa.party_id
    where pa.id = p_application_id;
  if not found then
    raise exception 'APPLICATION_NOT_FOUND: 지원 내역을 찾을 수 없습니다.';
  end if;

  perform public.lock_activity_membership(v_peek.activity_id, v_peek.profile_id);

  select * into v_app from public.party_applications where id = p_application_id for update;
  if v_app.status = 'superseded' then
    raise exception 'APPLICATION_SUPERSEDED: 지원자가 같은 활동의 다른 파티에 먼저 승인되어 이 지원은 자동 종료되었습니다.';
  end if;
  if v_app.status <> 'pending' then
    raise exception 'APPLICATION_NOT_PENDING: 이미 처리된 지원입니다.';
  end if;

  -- parties 행 잠금: 같은 파티에 대한 동시 승인 요청을 여기서 직렬화한다.
  select * into v_party from public.parties where id = v_app.party_id for update;
  if v_party.leader_id <> auth.uid() and not public.is_admin() then
    raise exception 'NOT_LEADER: 파티장만 지원을 승인할 수 있습니다.';
  end if;
  if v_party.status not in ('recruiting', 'full') then
    raise exception 'PARTY_NOT_RECRUITING: 모집 중인 파티가 아닙니다.';
  end if;

  if exists (
    select 1 from public.party_members
    where activity_id = v_party.activity_id and profile_id = v_app.profile_id and status = 'active'
  ) then
    raise exception 'ALREADY_ACTIVE_IN_ACTIVITY: 지원자가 이미 같은 활동의 다른 파티에서 활동 중입니다.';
  end if;

  select count(*) into v_active_count from public.party_members
    where party_id = v_party.id and status = 'active';
  if v_active_count >= v_party.capacity then
    raise exception 'PARTY_FULL: 파티 정원이 가득 찼습니다.';
  end if;

  if v_app.role_slot_id is not null then
    select * into v_slot from public.party_role_slots where id = v_app.role_slot_id for update;
    if not found then
      raise exception 'ROLE_SLOT_NOT_FOUND: 선택한 역할을 찾을 수 없습니다.';
    end if;
    if v_slot.filled_count >= v_slot.capacity then
      raise exception 'ROLE_SLOT_FULL: 역할(%)의 정원이 가득 찼습니다.', v_slot.role_name;
    end if;
  end if;

  insert into public.party_members (party_id, profile_id, is_leader, status, role_slot_id)
  values (v_party.id, v_app.profile_id, false, 'active', v_app.role_slot_id);

  update public.party_applications set status = 'approved', decided_at = now() where id = p_application_id;

  -- 활동당 활성 멤버는 한 파티뿐 — 같은 활동의 이 지원자의 다른 대기 지원을 자동 정리한다.
  update public.party_applications
    set status = 'superseded', decided_at = now()
    where profile_id = v_app.profile_id
      and status = 'pending'
      and id <> p_application_id
      and party_id in (select id from public.parties where activity_id = v_party.activity_id);

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
-- 5. 확정 — 활동당 활성 멤버 1파티는 이미 승인 시점에 보장되므로, 더 이상 "같은 활동 다른 파티에
--    이미 확정됨" 충돌을 처리할 필요가 없다(기존 jsonb 반환/제외 로직 제거, architecture.md 갱신).
-- ---------------------------------------------------------------------------
drop function if exists public.confirm_party(uuid);

create or replace function public.confirm_party(p_party_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_party record;
  v_member record;
  v_active_count int;
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

  select count(*) into v_active_count from public.party_members where party_id = p_party_id and status = 'active';
  if v_active_count = 0 then
    raise exception 'PARTY_CONFIRM_NO_MEMBERS: 활성 멤버가 없어 확정할 수 없습니다.';
  end if;

  update public.party_members set is_confirmed = true where party_id = p_party_id and status = 'active';

  update public.party_applications
    set status = 'rejected', decided_at = now()
    where party_id = p_party_id and status = 'pending';

  update public.parties set status = 'confirmed' where id = p_party_id;

  for v_member in select * from public.party_members where party_id = p_party_id and status = 'active'
  loop
    perform public.create_notification(
      v_member.profile_id, 'party_confirmed', 'party', p_party_id,
      '파티가 확정되었어요', coalesce(v_party.title, '파티') || ' 팀이 확정되었습니다.',
      'party_confirmed:' || v_member.id::text
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. 팀장의 파티 정보 수정. 역할 슬롯 정원은 "현재 그 역할의 인원(filled_count)보다 적게" 줄일 수 없다.
--    (역할 추가/삭제, 이름 변경은 이번 범위에 포함하지 않음 — PROGRESS.md 참고)
-- ---------------------------------------------------------------------------
create or replace function public.update_party_details(
  p_party_id uuid,
  p_title text,
  p_description text,
  p_meeting_mode text,
  p_recruit_deadline timestamptz,
  p_required_common_time jsonb,
  p_role_slot_capacities jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_party record;
  v_item jsonb;
  v_slot_id uuid;
  v_new_capacity smallint;
  v_slot record;
  v_total_capacity smallint;
  v_active_count int;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: 로그인이 필요합니다.';
  end if;

  select * into v_party from public.parties where id = p_party_id for update;
  if not found then
    raise exception 'PARTY_NOT_FOUND: 파티를 찾을 수 없습니다.';
  end if;
  if v_party.leader_id <> auth.uid() and not public.is_admin() then
    raise exception 'NOT_LEADER: 파티장만 파티 정보를 수정할 수 있습니다.';
  end if;
  if v_party.status in ('cancelled', 'completed') then
    raise exception 'PARTY_INACTIVE: 종료된 파티는 수정할 수 없습니다.';
  end if;

  if p_role_slot_capacities is not null then
    for v_item in select * from jsonb_array_elements(p_role_slot_capacities)
    loop
      v_slot_id := (v_item ->> 'role_slot_id')::uuid;
      v_new_capacity := (v_item ->> 'capacity')::smallint;

      select * into v_slot from public.party_role_slots where id = v_slot_id and party_id = p_party_id for update;
      if not found then
        raise exception 'ROLE_SLOT_NOT_FOUND: 역할 슬롯을 찾을 수 없습니다.';
      end if;
      if v_new_capacity is null or v_new_capacity < 1 then
        raise exception 'INVALID_ROLE_SLOTS: %의 인원은 1명 이상이어야 합니다.', v_slot.role_name;
      end if;
      if v_new_capacity < v_slot.filled_count then
        raise exception 'ROLE_SLOT_BELOW_CURRENT: %의 인원을 현재 인원(%)보다 적게 줄일 수 없습니다.', v_slot.role_name, v_slot.filled_count;
      end if;

      update public.party_role_slots set capacity = v_new_capacity where id = v_slot_id;
    end loop;
  end if;

  select coalesce(sum(capacity), 0) into v_total_capacity from public.party_role_slots where party_id = p_party_id;
  select count(*) into v_active_count from public.party_members where party_id = p_party_id and status = 'active';

  update public.parties
  set title = nullif(trim(p_title), ''),
      description = nullif(trim(p_description), ''),
      meeting_mode = p_meeting_mode,
      recruit_deadline = p_recruit_deadline,
      required_common_time = p_required_common_time,
      capacity = v_total_capacity,
      status = case when status = 'full' and v_total_capacity > v_active_count then 'recruiting' else status end
  where id = p_party_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 권한 정리
-- ---------------------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'create_party(uuid, text, text, text, timestamptz, jsonb, text)',
    'apply_to_party(uuid, uuid, text)',
    'approve_application(uuid)',
    'confirm_party(uuid)',
    'update_party_details(uuid, text, text, text, timestamptz, jsonb, jsonb)'
  ]
  loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end;
$$;
