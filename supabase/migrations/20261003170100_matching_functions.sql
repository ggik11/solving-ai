-- 4-B단계: 빠른 매칭 DB 함수 + 스케줄 워커 (지시서 7장 B, architecture.md 5.3~5.5절, 12장).
--
-- 설계 메모:
-- - 사용자 쪽 쓰기(join/cancel/respond)는 파티 함수와 같은 패턴: SECURITY DEFINER + auth.uid()
--   기반 권한 체크, matching_queue/match_proposal_members의 RLS를 운영자 전용으로 좁혀 이 함수들을
--   거치도록 강제(20261003170000에서 이미 좁혀둠).
-- - 실제 매칭 편성(_find_match_for_group)은 src/lib/matching.ts의 순수 함수와 같은 설계(탐욕 +
--   제한된 백트래킹, 전체 공통 시간 교집합, 팀장 동의 필수, 차단 관계 제외, 결정적 동점 규칙)를
--   plpgsql로 재구현한다. pg_cron은 DB 함수만 호출할 수 있어 워커 자체가 DB 안에서 돌아야 하기
--   때문이다 — Node 코드를 그대로 재사용할 수 없다. 공통 시간 교집합은 요일별 분 단위를
--   "주간 분 오프셋"(day_of_week*1440 + 분, 0~10079)으로 매핑한 int4multirange로 표현하고
--   `*`(교집합) 연산자로 계산한다 — PostgreSQL 17 멀티레인지 연산자를 그대로 쓸 수 있어 별도
--   구간 스윕 알고리즘을 직접 짤 필요가 없다.
-- - 워커는 server-side 스케줄(pg_cron)로 실행한다(로컬 스택에서 pg_cron이 동작함을 확인했다 —
--   shared_preload_libraries에 이미 포함돼 있어 CREATE EXTENSION만으로 바로 쓸 수 있었다).
--   개발 중 즉시 실행용으로 `npm run worker:match`(scripts/run-match-worker.mjs)도 제공한다.
-- - 워커 동시 실행 안전성: 제안 만료 처리는 `FOR UPDATE SKIP LOCKED`로 행 단위 경쟁을 피하고,
--   매칭 편성은 대기열 후보를 모을 때 `FOR UPDATE SKIP LOCKED`로 잠가 같은 사람이 동시에 두
--   그룹에 들어가거나 두 워커가 같은 사람으로 서로 다른 제안을 동시에 만들지 못하게 한다.
--   전원 수락 시 파티 생성은 `match_proposals` 행 잠금 + `party_id is not null` 멱등 가드로
--   마지막 두 명이 동시에 수락해도 파티가 1개만 생기게 한다(approve_application과 동일 패턴).

create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- 0. 헬퍼: 공통 시간 계산(멀티레인지) / 차단 관계
-- ---------------------------------------------------------------------------
create or replace function public._profile_weekly_multirange(p_profile_id uuid)
returns int4multirange
language sql
stable
set search_path = public
as $$
  select coalesce(
    range_agg(int4range(
      day_of_week * 1440 + (extract(hour from start_time)::int * 60 + extract(minute from start_time)::int),
      day_of_week * 1440 + (extract(hour from end_time)::int * 60 + extract(minute from end_time)::int)
    )),
    '{}'::int4multirange
  )
  from public.availability_slots
  where profile_id = p_profile_id;
$$;

create or replace function public._multirange_minutes(p_mr int4multirange)
returns int
language sql
immutable
as $$
  select coalesce(sum(upper(r) - lower(r)), 0)::int from unnest(p_mr) as r;
$$;

create or replace function public._blocked(p_a uuid, p_b uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = p_a and blocked_id = p_b) or (blocker_id = p_b and blocked_id = p_a)
  );
$$;

revoke all on function public._profile_weekly_multirange(uuid) from public;
revoke all on function public._multirange_minutes(int4multirange) from public;
revoke all on function public._blocked(uuid, uuid) from public;

-- ---------------------------------------------------------------------------
-- 1. 대기열 참가/취소 (사용자)
-- ---------------------------------------------------------------------------
create or replace function public.join_matching_queue(
  p_activity_id uuid,
  p_template_id uuid,
  p_eligible_roles text[],
  p_willing_leader boolean,
  p_continue_on_fail boolean
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity record;
  v_role text;
  v_queue_id uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: 로그인이 필요합니다.';
  end if;
  if p_eligible_roles is null or array_length(p_eligible_roles, 1) is null then
    raise exception 'ROLE_REQUIRED: 수행 가능한 역할을 1개 이상 선택해야 합니다.';
  end if;

  select status, participation_mode into v_activity from public.activities where id = p_activity_id;
  if not found then
    raise exception 'ACTIVITY_NOT_FOUND: 활동을 찾을 수 없습니다.';
  end if;
  if v_activity.status <> 'published' then
    raise exception 'ACTIVITY_NOT_AVAILABLE: 공개된 활동이 아닙니다.';
  end if;
  if v_activity.participation_mode = 'solo' then
    raise exception 'ACTIVITY_SOLO_ONLY: 개인 참여만 가능한 활동에는 매칭을 신청할 수 없습니다.';
  end if;

  if not exists (select 1 from public.activity_match_templates where id = p_template_id and activity_id = p_activity_id and is_active) then
    raise exception 'TEMPLATE_NOT_FOUND: 매칭 템플릿을 찾을 수 없습니다.';
  end if;

  foreach v_role in array p_eligible_roles loop
    if not exists (select 1 from public.activity_match_template_roles where template_id = p_template_id and role_name = v_role) then
      raise exception 'INVALID_ROLE: 역할(%)은 이 템플릿에 없습니다.', v_role;
    end if;
  end loop;

  if not exists (select 1 from public.availability_slots where profile_id = auth.uid()) then
    raise exception 'NO_AVAILABILITY: 가능한 시간을 먼저 설정해야 매칭에 참가할 수 있습니다.';
  end if;

  perform public.lock_activity_membership(p_activity_id, auth.uid());

  if exists (
    select 1 from public.party_members
    where activity_id = p_activity_id and profile_id = auth.uid() and status = 'active'
  ) then
    raise exception 'ALREADY_ACTIVE_IN_ACTIVITY: 이미 이 활동의 파티에서 활동 중입니다.';
  end if;

  if exists (
    select 1 from public.matching_queue
    where activity_id = p_activity_id and profile_id = auth.uid() and status in ('waiting', 'proposed')
  ) then
    raise exception 'ALREADY_IN_QUEUE: 이미 이 활동의 매칭 대기열에 참가 중입니다.';
  end if;

  insert into public.matching_queue (activity_id, profile_id, template_id, eligible_roles, willing_leader, continue_on_fail, status)
  values (p_activity_id, auth.uid(), p_template_id, p_eligible_roles, coalesce(p_willing_leader, false), coalesce(p_continue_on_fail, false), 'waiting')
  returning id into v_queue_id;

  return v_queue_id;
end;
$$;

create or replace function public.cancel_matching_queue(p_queue_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_queue record;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: 로그인이 필요합니다.';
  end if;

  select * into v_queue from public.matching_queue where id = p_queue_id;
  if not found then
    raise exception 'QUEUE_NOT_FOUND: 대기열 항목을 찾을 수 없습니다.';
  end if;
  if v_queue.profile_id <> auth.uid() then
    raise exception 'NOT_OWNER: 본인의 대기열만 취소할 수 있습니다.';
  end if;
  if v_queue.status <> 'waiting' then
    raise exception 'QUEUE_NOT_WAITING: 이미 제안을 받았거나 종료된 항목입니다.';
  end if;

  update public.matching_queue set status = 'cancelled' where id = p_queue_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. 제안 해제/확정 (내부 — respond_to_match_proposal과 워커가 호출)
-- ---------------------------------------------------------------------------
create or replace function public._release_match_proposal(p_proposal_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal record;
  v_member record;
begin
  if p_proposal_id is null then
    return;
  end if;

  select * into v_proposal from public.match_proposals where id = p_proposal_id for update;
  if not found or v_proposal.status <> 'proposed' then
    return; -- 이미 처리됨 — 멱등
  end if;

  update public.match_proposals
    set status = case when p_reason = 'expired' then 'expired' else 'cancelled' end
    where id = p_proposal_id;

  for v_member in
    select mpm.profile_id, mq.id as queue_row_id, mq.continue_on_fail
    from public.match_proposal_members mpm
    join public.matching_queue mq on mq.id = mpm.queue_id
    where mpm.proposal_id = p_proposal_id
  loop
    update public.matching_queue
      set status = case when v_member.continue_on_fail then 'waiting' else 'cancelled' end
      where id = v_member.queue_row_id;

    perform public.create_notification(
      v_member.profile_id, 'match_proposal_released', 'activity', v_proposal.activity_id,
      case when p_reason = 'expired' then '매칭 제안이 만료됐어요' else '매칭 제안이 취소됐어요' end,
      case when v_member.continue_on_fail
        then '다시 대기열에 등록되어 계속 찾는 중이에요.'
        else '대기열에서 빠졌어요. 다시 참가하려면 매칭 화면에서 재신청해 주세요.'
      end,
      'match_proposal_released:' || p_proposal_id::text || ':' || v_member.profile_id::text
    );
  end loop;
end;
$$;

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
    return; -- 이미 처리됨(동시 마지막 수락 경쟁에서 패배한 쪽) — 멱등
  end if;

  -- 활동+사용자 단위로 advisory lock을 걸어 approve_application과의 교차 경쟁을 직렬화한다.
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

  update public.match_proposals set status = 'matched', party_id = v_party_id where id = p_proposal_id;
end;
$$;

create or replace function public.respond_to_match_proposal(p_proposal_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal record;
  v_member record;
  v_all_accepted boolean;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: 로그인이 필요합니다.';
  end if;

  select * into v_proposal from public.match_proposals where id = p_proposal_id for update;
  if not found then
    raise exception 'PROPOSAL_NOT_FOUND: 제안을 찾을 수 없습니다.';
  end if;

  select * into v_member from public.match_proposal_members where proposal_id = p_proposal_id and profile_id = auth.uid();
  if not found then
    raise exception 'NOT_A_MEMBER: 이 제안의 대상이 아닙니다.';
  end if;
  if v_member.response <> 'pending' then
    raise exception 'ALREADY_RESPONDED: 이미 응답했습니다.';
  end if;

  if v_proposal.status = 'proposed' and v_proposal.expires_at <= now() then
    perform public._release_match_proposal(p_proposal_id, 'expired');
    raise exception 'PROPOSAL_EXPIRED: 이미 기한이 지난 제안입니다.';
  end if;
  if v_proposal.status <> 'proposed' then
    raise exception 'PROPOSAL_NOT_PENDING: 이미 처리된 제안입니다.';
  end if;

  if not p_accept then
    update public.match_proposal_members set response = 'declined', responded_at = now()
      where proposal_id = p_proposal_id and profile_id = auth.uid();
    perform public._release_match_proposal(p_proposal_id, 'declined');
    return;
  end if;

  update public.match_proposal_members set response = 'accepted', responded_at = now()
    where proposal_id = p_proposal_id and profile_id = auth.uid();

  select not exists (
    select 1 from public.match_proposal_members where proposal_id = p_proposal_id and response <> 'accepted'
  ) into v_all_accepted;

  if v_all_accepted then
    perform public._finalize_match_proposal(p_proposal_id);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. 매칭 편성 (내부 — 워커가 (활동, 템플릿) 그룹마다 호출)
-- ---------------------------------------------------------------------------
create or replace function public._find_match_for_group(
  p_activity_id uuid,
  p_template_id uuid,
  p_as_of timestamptz
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings jsonb;
  v_min_minutes int;
  v_max_candidates int;
  v_max_steps int;
  v_expiry_hours int;
  v_required_campus text;
  v_pool_size int;
  v_slot_roles text[];
  v_team_size int;
  v_chosen int[];
  v_resume int[];
  v_depth int;
  v_steps int;
  v_found int;
  v_role text;
  v_running int4multirange;
  v_candidate_avail int4multirange;
  v_i int;
  v_blocked boolean;
  v_leader_ok boolean;
  v_proposal_id uuid;
  v_member record;
begin
  select value into v_settings from public.app_settings where key = 'matching_settings';
  v_min_minutes := coalesce((v_settings ->> 'min_common_minutes')::int, 60);
  v_max_candidates := coalesce((v_settings ->> 'max_candidates_per_search')::int, 30);
  v_max_steps := coalesce((v_settings ->> 'max_backtrack_steps')::int, 500);
  v_expiry_hours := coalesce((v_settings ->> 'proposal_expiry_hours')::int, 24);
  v_required_campus := coalesce(v_settings ->> 'required_campus', '서울');

  select array_agg(role_name order by role_name, n)
    into v_slot_roles
  from public.activity_match_template_roles r
  cross join lateral generate_series(1, r.capacity) as g(n)
  where r.template_id = p_template_id;

  v_team_size := coalesce(array_length(v_slot_roles, 1), 0);
  if v_team_size = 0 then
    return null;
  end if;

  drop table if exists pg_temp.match_worker_pool;
  create temp table match_worker_pool (
    idx int primary key,
    queue_id uuid,
    profile_id uuid,
    leader_opt_in boolean,
    eligible_roles text[],
    avail int4multirange
  ) on commit drop;

  -- row_number()(윈도우 함수)와 FOR UPDATE를 같은 질의에 못 섞으므로, 잠그는 질의를 CTE로
  -- 분리한다(잠금은 CTE 안에서 끝나고, 바깥 SELECT는 그 결과에만 번호를 매긴다).
  insert into match_worker_pool (idx, queue_id, profile_id, leader_opt_in, eligible_roles, avail)
  with locked as (
    select mq.id, mq.profile_id, mq.willing_leader, mq.eligible_roles, mq.created_at
    from public.matching_queue mq
    join public.profiles pr on pr.id = mq.profile_id
    where mq.activity_id = p_activity_id
      and mq.template_id = p_template_id
      and mq.status = 'waiting'
      and pr.campus = v_required_campus
    order by mq.created_at, mq.id
    limit v_max_candidates
    for update of mq skip locked
  )
  select row_number() over (order by created_at, id)::int, id, profile_id, willing_leader, eligible_roles,
         public._profile_weekly_multirange(profile_id)
  from locked;

  select count(*) into v_pool_size from match_worker_pool;
  if v_pool_size < v_team_size then
    return null;
  end if;

  v_chosen := array_fill(0, array[v_team_size]);
  v_resume := array_fill(1, array[v_team_size]);
  v_depth := 1;
  v_steps := 0;

  while v_depth >= 1 and v_depth <= v_team_size loop
    if v_steps >= v_max_steps then
      return null;
    end if;
    v_steps := v_steps + 1;

    v_role := v_slot_roles[v_depth];

    v_running := '{[0,10080)}'::int4multirange;
    for v_i in 1..(v_depth - 1) loop
      select avail into v_candidate_avail from match_worker_pool where idx = v_chosen[v_i];
      v_running := v_running * v_candidate_avail;
      exit when isempty(v_running);
    end loop;

    v_found := null;
    for v_i in v_resume[v_depth]..v_pool_size loop
      if v_i = any(v_chosen[1:v_depth - 1]) then
        continue;
      end if;

      if not exists (select 1 from match_worker_pool p where p.idx = v_i and v_role = any(p.eligible_roles)) then
        continue;
      end if;

      select exists (
        select 1 from unnest(v_chosen[1:v_depth - 1]) as cidx
        join match_worker_pool cp on cp.idx = cidx
        join match_worker_pool np on np.idx = v_i
        where public._blocked(np.profile_id, cp.profile_id)
      ) into v_blocked;
      if v_blocked then
        continue;
      end if;

      select avail into v_candidate_avail from match_worker_pool where idx = v_i;
      if public._multirange_minutes(v_running * v_candidate_avail) < v_min_minutes then
        continue;
      end if;

      v_found := v_i;
      v_resume[v_depth] := v_i + 1;
      exit;
    end loop;

    if v_found is not null then
      v_chosen[v_depth] := v_found;
      v_depth := v_depth + 1;
      if v_depth <= v_team_size then
        v_resume[v_depth] := 1;
      end if;
    else
      v_resume[v_depth] := 1;
      v_depth := v_depth - 1;
    end if;

    if v_depth = v_team_size + 1 then
      select exists (
        select 1 from unnest(v_chosen) as cidx join match_worker_pool p on p.idx = cidx where p.leader_opt_in
      ) into v_leader_ok;
      if not v_leader_ok then
        v_depth := v_depth - 1;
      end if;
    end if;
  end loop;

  if v_depth <= v_team_size then
    return null;
  end if;

  insert into public.match_proposals (activity_id, template_id, status, proposed_leader_profile_id, expires_at)
  select p_activity_id, p_template_id, 'proposed',
         (select p.profile_id from unnest(v_chosen) as cidx join match_worker_pool p on p.idx = cidx where p.leader_opt_in limit 1),
         p_as_of + make_interval(hours => v_expiry_hours)
  returning id into v_proposal_id;

  for v_i in 1..v_team_size loop
    insert into public.match_proposal_members (proposal_id, profile_id, queue_id, role_name)
    select v_proposal_id, p.profile_id, p.queue_id, v_slot_roles[v_i]
    from match_worker_pool p where p.idx = v_chosen[v_i];
  end loop;

  update public.matching_queue set status = 'proposed'
  where id in (select queue_id from match_worker_pool where idx = any(v_chosen));

  for v_member in select profile_id from public.match_proposal_members where proposal_id = v_proposal_id loop
    perform public.create_notification(
      v_member.profile_id, 'match_proposal_created', 'match_proposal', v_proposal_id,
      '매칭 제안이 도착했어요', '팀 구성이 완료되어 수락을 기다리고 있어요.',
      'match_proposal_created:' || v_proposal_id::text
    );
  end loop;

  return v_proposal_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. 수동 파티 합류 시 대기열 정리 (approve_application에서 호출)
-- ---------------------------------------------------------------------------
create or replace function public._cancel_matching_queue_for_activity(p_activity_id uuid, p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_proposal_id uuid;
begin
  for v_row in
    select * from public.matching_queue
    where activity_id = p_activity_id and profile_id = p_profile_id and status in ('waiting', 'proposed')
  loop
    if v_row.status = 'proposed' then
      select proposal_id into v_proposal_id from public.match_proposal_members where queue_id = v_row.id limit 1;
      perform public._release_match_proposal(v_proposal_id, 'member_joined_manual_party');
    else
      update public.matching_queue set status = 'cancelled' where id = v_row.id;
    end if;
  end loop;
end;
$$;

revoke all on function public._release_match_proposal(uuid, text) from public;
revoke all on function public._finalize_match_proposal(uuid) from public;
revoke all on function public._find_match_for_group(uuid, uuid, timestamptz) from public;
revoke all on function public._cancel_matching_queue_for_activity(uuid, uuid) from public;

-- approve_application 재정의: 기존 로직(20261003160000) + 매칭 대기열 정리 한 줄만 추가.
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
  v_new_member_nickname text;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: 로그인이 필요합니다.';
  end if;

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

  update public.party_applications
    set status = 'superseded', decided_at = now()
    where profile_id = v_app.profile_id
      and status = 'pending'
      and id <> p_application_id
      and party_id in (select id from public.parties where activity_id = v_party.activity_id);

  if v_active_count + 1 >= v_party.capacity then
    update public.parties set status = 'full' where id = v_party.id and status = 'recruiting';
  end if;

  -- 매칭 대기열에 있던 사람이 수동 파티에 합류했다면 대기열/진행 중인 제안을 정리한다(4-B).
  perform public._cancel_matching_queue_for_activity(v_party.activity_id, v_app.profile_id);

  select nickname into v_new_member_nickname from public.profiles where id = v_app.profile_id;
  perform public.insert_system_chat_message(
    v_party.id,
    coalesce(v_new_member_nickname, '멤버') || '님이 파티에 합류했어요.'
  );

  perform public.create_notification(
    v_app.profile_id, 'party_application_approved', 'party', v_party.id,
    '파티 지원이 승인되었어요', coalesce(v_party.title, '파티') || ' 지원이 승인되었습니다.',
    'party_application_approved:' || p_application_id::text
  );

  return v_party.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. 워커 진입점 — pg_cron이 매분 호출한다. p_as_of를 인자로 받아 테스트에서 시간을 조작할 수 있다.
-- ---------------------------------------------------------------------------
create or replace function public.run_match_worker(p_as_of timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings jsonb;
  v_bookmark_hours int;
  v_expired_count int := 0;
  v_proposal_count int := 0;
  v_bookmark_notified int := 0;
  v_proposal record;
  v_group record;
  v_new_proposal_id uuid;
  v_bookmark record;
begin
  select value into v_settings from public.app_settings where key = 'matching_settings';
  v_bookmark_hours := coalesce((v_settings ->> 'bookmark_deadline_hours')::int, 48);

  for v_proposal in
    select id from public.match_proposals
    where status = 'proposed' and expires_at <= p_as_of
    for update skip locked
  loop
    begin
      perform public._release_match_proposal(v_proposal.id, 'expired');
      v_expired_count := v_expired_count + 1;
    exception when others then
      raise warning 'run_match_worker: 제안(%) 만료 처리 실패: %', v_proposal.id, sqlerrm;
    end;
  end loop;

  for v_group in
    select distinct activity_id, template_id from public.matching_queue where status = 'waiting'
  loop
    begin
      v_new_proposal_id := public._find_match_for_group(v_group.activity_id, v_group.template_id, p_as_of);
      if v_new_proposal_id is not null then
        v_proposal_count := v_proposal_count + 1;
      end if;
    exception when others then
      raise warning 'run_match_worker: 그룹(활동 %, 템플릿 %) 매칭 시도 실패: %', v_group.activity_id, v_group.template_id, sqlerrm;
    end;
  end loop;

  for v_bookmark in
    select b.profile_id, b.activity_id, a.title
    from public.bookmarks b
    join public.activities a on a.id = b.activity_id
    where a.status = 'published'
      and a.apply_end_at is not null
      and a.apply_end_at > p_as_of
      and a.apply_end_at <= p_as_of + make_interval(hours => v_bookmark_hours)
  loop
    perform public.create_notification(
      v_bookmark.profile_id, 'bookmark_deadline_soon', 'activity', v_bookmark.activity_id,
      '마감이 임박했어요', coalesce(v_bookmark.title, '북마크한 활동') || ' 접수 마감이 얼마 남지 않았습니다.',
      'bookmark_deadline_soon:' || v_bookmark.activity_id::text || ':' || v_bookmark.profile_id::text
    );
    v_bookmark_notified := v_bookmark_notified + 1;
  end loop;

  return jsonb_build_object(
    'as_of', p_as_of,
    'expired_proposals', v_expired_count,
    'new_proposals', v_proposal_count,
    'bookmark_notifications_checked', v_bookmark_notified
  );
end;
$$;

-- pg_cron: 매분 워커를 실행한다(migrations 재적용 시 중복 등록되지 않도록 먼저 지운다).
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'match-worker';
exception when others then
  null; -- pg_cron 미설치 등 예외 상황에서도 마이그레이션 전체가 실패하지 않게 한다.
end;
$$;

select cron.schedule('match-worker', '* * * * *', $$select public.run_match_worker(now());$$);

-- ---------------------------------------------------------------------------
-- 권한 정리
-- ---------------------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'join_matching_queue(uuid, uuid, text[], boolean, boolean)',
    'cancel_matching_queue(uuid)',
    'respond_to_match_proposal(uuid, boolean)',
    'approve_application(uuid)'
  ]
  loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;

  execute 'revoke all on function public.run_match_worker(timestamptz) from public';
  execute 'grant execute on function public.run_match_worker(timestamptz) to service_role';
end;
$$;
