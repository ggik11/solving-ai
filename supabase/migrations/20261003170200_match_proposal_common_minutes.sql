-- 제안 화면에 "전체 공통 시간(최소한으로 공개)"을 보여주기 위해 총 공통 분을 저장해 둔다
-- (개별 멤버의 정확한 시간표는 공개하지 않고 합계만 쓴다).
alter table public.match_proposals add column common_minutes int;

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
  v_final_minutes int;
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

  v_running := '{[0,10080)}'::int4multirange;
  for v_i in 1..v_team_size loop
    select avail into v_candidate_avail from match_worker_pool where idx = v_chosen[v_i];
    v_running := v_running * v_candidate_avail;
  end loop;
  v_final_minutes := public._multirange_minutes(v_running);

  insert into public.match_proposals (activity_id, template_id, status, proposed_leader_profile_id, expires_at, common_minutes)
  select p_activity_id, p_template_id, 'proposed',
         (select p.profile_id from unnest(v_chosen) as cidx join match_worker_pool p on p.idx = cidx where p.leader_opt_in limit 1),
         p_as_of + make_interval(hours => v_expiry_hours),
         v_final_minutes
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
