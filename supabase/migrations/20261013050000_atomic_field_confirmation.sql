-- G3 보완: 포스터를 저장하지 않아 등록·제보 화면에서 분석한 결과가 저장 시 사라지던 문제를
-- 고친다. docs/teachable-machine-integration.md 가이드 5.4의 5번("저장 시 분석 결과와 확정
-- 분야를 함께 기록하고, 모델 후보를 그대로 수락했는지도 남긴다") 그대로.
--
-- 설계 메모:
-- 1. 관리자 등록: activities insert + poster_analyses insert + activity_fields insert를 하나의
--    SECURITY DEFINER 함수(create_activity_with_fields) 안에서 처리해 한 트랜잭션으로 묶는다 —
--    클라이언트가 세 번 나눠 호출하면(활동 생성 성공 후 분석 저장이 실패하는 등) 부분 실패가
--    생길 수 있으므로, 이 구현에서는 처음부터 하나의 함수 호출로만 노출한다.
-- 2. 사용자 제보: 제보자는 분야를 "제안"만 할 수 있다 — activity_fields(확정, 운영자 쓰기 전용)에
--    직접 쓰지 않고 새 activity_field_proposals(제안, 함수로만 쓰기)에 담는다. submit_activity를
--    확장해 분석 결과 + 제안 분야를 같은 호출에서 함께 저장한다. 관리자가 승인할 때
--    (approve_activity_submission) 비로소 activity_fields를 확정한다 — "확정 함수를 호출하면
--    거부된다"는 요구는 이미 있는 is_admin() 가드로 충족된다(제보자가 approve_activity_submission을
--    불러도 NOT_ADMIN으로 거부됨).
-- 3. 이 저장소는 사용자 제보도 activities의 draft 행을 그대로 쓴다(5-A/G3 설계 그대로) — 원
--    가이드의 "submission_id"는 이 저장소에서는 activity_id와 같은 값이다. 따라서 poster_analyses는
--    제보 시점부터 이미 (제보 행의) activity_id로 연결되어 있고, 승인 시 "생성된 activity_id에
--    연결"하는 작업은 추가로 필요하지 않다 — 행이 그대로 published로 바뀔 뿐 id가 바뀌지 않는다.
-- 4. "모델 후보를 그대로 수락했는지"는 activity_fields.accepted_model_candidate(신규 컬럼)에
--    남긴다. 클라이언트가 "방금 모델 후보 칩을 눌러서 선택한 분야 id 목록"을 그대로 전달하면,
--    함수가 그 목록에 포함된 분야만 source='teachable_machine' + accepted_model_candidate=true로
--    기록한다. 그 밖의 수동 선택은 source='manual' + accepted_model_candidate=null이다.
--
-- PostgreSQL 함수 신원(identity)은 "이름 + 파라미터 타입 목록" 전체라서, 파라미터 개수가
-- 달라지면 create or replace가 기존 함수를 대체하지 않고 오버로드로 추가해 버린다(옛 시그니처가
-- anon/authenticated 권한을 그대로 쥔 채 남음 — 20261004090000의 교훈 그대로). 그래서 바뀌는
-- 함수는 옛 시그니처를 먼저 명시적으로 지운다.

-- ---------------------------------------------------------------------------
-- 1. activity_fields: 모델 후보를 그대로 수락했는지(가이드 5.4 5번, 체크리스트 통계용).
-- ---------------------------------------------------------------------------
alter table public.activity_fields add column accepted_model_candidate boolean;
comment on column public.activity_fields.accepted_model_candidate is
  '이 분야가 모델이 제안한 후보를 그대로 수락해 확정됐는지. source=teachable_machine일 때만 true/false 의미가 있고, source=manual이면 항상 null(모델이 관여하지 않음). 관리자 대시보드의 분야별 모델 후보 수락률 계산에 쓰인다.';

-- ---------------------------------------------------------------------------
-- 2. activity_field_proposals: 제보자의 분야 "제안"(확정 아님). activity_fields와 모양은 같지만
--    쓰기 주체가 다르다 — 제보자 본인이 submit_activity를 통해 자신의 제안을 남긴다.
-- ---------------------------------------------------------------------------
create table public.activity_field_proposals (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  interest_id uuid not null references public.interests (id),
  role text not null check (role in ('primary', 'secondary')),
  source text not null check (source in ('manual', 'teachable_machine')),
  analysis_id uuid references public.poster_analyses (id) on delete set null,
  proposed_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  unique (activity_id, interest_id)
);

create unique index activity_field_proposals_one_primary_per_activity
  on public.activity_field_proposals (activity_id)
  where role = 'primary';

create index activity_field_proposals_activity_id_idx on public.activity_field_proposals (activity_id);

comment on table public.activity_field_proposals is
  '제보자가 "제안"만 한 분야(확정 아님). 관리자가 /admin/submissions 승인 화면에서 참고하고, 승인 시 직접 고른 분야만 activity_fields에 확정된다.';

alter table public.activity_field_proposals enable row level security;

-- 운영자 전체 조회 + 제보자 본인 조회. 쓰기 정책은 두지 않는다 — submit_activity() 함수로만 쓴다.
create policy activity_field_proposals_select on public.activity_field_proposals for select
  using (public.is_admin() or proposed_by = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. 관리자 등록: 활동 생성 + 분석 저장 + 분야 확정을 한 트랜잭션으로.
-- ---------------------------------------------------------------------------
create or replace function public.create_activity_with_fields(
  p_title text,
  p_summary text,
  p_description text,
  p_org_name text,
  p_source_url text,
  p_location_type text,
  p_region text,
  p_activity_type_id uuid,
  p_eligibility text,
  p_participation_mode text,
  p_team_min_size integer,
  p_team_max_size integer,
  p_benefit text,
  p_apply_start_at timestamptz,
  p_apply_end_at timestamptz,
  p_activity_start_at timestamptz,
  p_activity_end_at timestamptz,
  p_status text,
  p_source_url_resolved text,
  p_apply_end_at_evidence text,
  p_weekly_hours numeric,
  p_eligibility_scope text,
  p_eligible_major_ids uuid[],
  p_primary_interest_id uuid default null,
  p_secondary_interest_ids uuid[] default '{}',
  p_accepted_candidate_interest_ids uuid[] default '{}',
  p_poster_hash text default null,
  p_model_version text default null,
  p_preprocessing_version text default null,
  p_poster_scores jsonb default null,
  p_poster_top_class text default null,
  p_poster_top_score numeric default null,
  p_poster_margin numeric default null,
  p_poster_status text default null,
  p_poster_failure_reason text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity_id uuid;
  v_analysis_id uuid;
  v_accepted uuid[];
  v_secondary_id uuid;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: 운영자만 활동을 등록할 수 있습니다.';
  end if;
  if nullif(trim(p_title), '') is null then
    raise exception 'TITLE_REQUIRED: 활동 제목을 입력해 주세요.';
  end if;
  if p_location_type not in ('online', 'offline', 'hybrid') then
    raise exception 'INVALID_LOCATION_TYPE: 진행 방식을 선택해 주세요.';
  end if;
  if p_participation_mode not in ('solo', 'team', 'both') then
    raise exception 'INVALID_PARTICIPATION_MODE: 참여 형태를 선택해 주세요.';
  end if;
  if p_status not in ('draft', 'published', 'closed', 'archived') then
    raise exception 'INVALID_STATUS: 공개 상태를 선택해 주세요.';
  end if;
  if p_eligibility_scope not in ('any', 'restricted', 'unknown') then
    raise exception 'INVALID_ELIGIBILITY_SCOPE: 지원 자격 범위를 선택해 주세요.';
  end if;
  if p_eligibility_scope = 'restricted' and coalesce(array_length(p_eligible_major_ids, 1), 0) = 0 then
    raise exception 'ELIGIBLE_MAJORS_REQUIRED: 지정 전공 제한이면 전공을 하나 이상 선택해 주세요.';
  end if;

  v_accepted := coalesce(p_accepted_candidate_interest_ids, '{}'::uuid[]);

  insert into public.activities (
    title, summary, description, org_name, source_url, location_type, region,
    activity_type_id, eligibility, participation_mode, team_min_size, team_max_size, benefit,
    apply_start_at, apply_end_at, activity_start_at, activity_end_at, status, last_verified_at,
    source_url_resolved, apply_end_at_evidence, weekly_hours, eligibility_scope, eligible_major_ids,
    eligibility_verified_at, is_demo, created_by
  ) values (
    trim(p_title), nullif(trim(p_summary), ''), nullif(trim(p_description), ''),
    nullif(trim(p_org_name), ''), nullif(trim(p_source_url), ''), p_location_type,
    nullif(trim(p_region), ''), p_activity_type_id, nullif(trim(p_eligibility), ''), p_participation_mode,
    p_team_min_size, p_team_max_size, nullif(trim(p_benefit), ''),
    p_apply_start_at, p_apply_end_at, p_activity_start_at, p_activity_end_at, p_status, now(),
    nullif(trim(p_source_url_resolved), ''), nullif(trim(p_apply_end_at_evidence), ''), p_weekly_hours,
    p_eligibility_scope, coalesce(p_eligible_major_ids, '{}'::uuid[]),
    case when p_eligibility_scope = 'unknown' then null else now() end, false, auth.uid()
  )
  returning id into v_activity_id;

  if p_poster_hash is not null then
    insert into public.poster_analyses (
      activity_id, poster_hash, model_version, preprocessing_version, scores,
      top_class, top_score, margin, status, failure_reason, analyzed_by
    ) values (
      v_activity_id, p_poster_hash, p_model_version, p_preprocessing_version, coalesce(p_poster_scores, '[]'::jsonb),
      p_poster_top_class, p_poster_top_score, p_poster_margin, p_poster_status, p_poster_failure_reason, auth.uid()
    )
    returning id into v_analysis_id;
  end if;

  if p_primary_interest_id is not null then
    insert into public.activity_fields (activity_id, interest_id, role, source, analysis_id, confirmed_by, accepted_model_candidate)
    values (
      v_activity_id, p_primary_interest_id, 'primary',
      case when p_primary_interest_id = any(v_accepted) then 'teachable_machine' else 'manual' end,
      case when p_primary_interest_id = any(v_accepted) then v_analysis_id else null end,
      auth.uid(),
      case when p_primary_interest_id = any(v_accepted) then true else null end
    );
  end if;

  for v_secondary_id in
    select distinct x from unnest(coalesce(p_secondary_interest_ids, '{}'::uuid[])) x
    where p_primary_interest_id is null or x <> p_primary_interest_id
  loop
    insert into public.activity_fields (activity_id, interest_id, role, source, analysis_id, confirmed_by, accepted_model_candidate)
    values (
      v_activity_id, v_secondary_id, 'secondary',
      case when v_secondary_id = any(v_accepted) then 'teachable_machine' else 'manual' end,
      case when v_secondary_id = any(v_accepted) then v_analysis_id else null end,
      auth.uid(),
      case when v_secondary_id = any(v_accepted) then true else null end
    );
  end loop;

  return v_activity_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. 사용자 제보 확장: 분석 결과 + 제안 분야를 같은 호출에서 함께 저장한다. 끝에 선택 파라미터를
--    추가한다(위 설명대로 옛 14-인자 시그니처를 먼저 지운다).
-- ---------------------------------------------------------------------------
drop function if exists public.submit_activity(
  text, text, text, text, text, text, text, text,
  timestamptz, timestamptz, timestamptz, timestamptz, text, text
);

create or replace function public.submit_activity(
  p_title text,
  p_summary text,
  p_description text,
  p_org_name text,
  p_source_url text,
  p_location_type text,
  p_region text,
  p_participation_mode text,
  p_apply_start_at timestamptz default null,
  p_apply_end_at timestamptz default null,
  p_activity_start_at timestamptz default null,
  p_activity_end_at timestamptz default null,
  p_source_url_resolved text default null,
  p_apply_end_at_evidence text default null,
  p_primary_interest_id uuid default null,
  p_secondary_interest_ids uuid[] default '{}',
  p_accepted_candidate_interest_ids uuid[] default '{}',
  p_poster_hash text default null,
  p_model_version text default null,
  p_preprocessing_version text default null,
  p_poster_scores jsonb default null,
  p_poster_top_class text default null,
  p_poster_top_score numeric default null,
  p_poster_margin numeric default null,
  p_poster_status text default null,
  p_poster_failure_reason text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit_per_day int;
  v_submitted_today int;
  v_activity_id uuid;
  v_analysis_id uuid;
  v_source_url text;
  v_accepted uuid[];
  v_secondary_id uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: 로그인이 필요합니다.';
  end if;
  perform public._require_active_profile(auth.uid());
  if nullif(trim(p_title), '') is null then
    raise exception 'TITLE_REQUIRED: 활동 제목을 입력해 주세요.';
  end if;
  if p_location_type not in ('online', 'offline', 'hybrid') then
    raise exception 'INVALID_LOCATION_TYPE: 진행 방식을 선택해 주세요.';
  end if;
  if p_participation_mode not in ('solo', 'team', 'both') then
    raise exception 'INVALID_PARTICIPATION_MODE: 참여 형태를 선택해 주세요.';
  end if;

  v_source_url := nullif(trim(p_source_url), '');
  if v_source_url is not null and v_source_url !~* '^https?://' then
    raise exception 'INVALID_SOURCE_URL: 원문 링크는 http:// 또는 https://로 시작해야 합니다.';
  end if;

  if p_apply_start_at is not null and p_apply_end_at is not null and p_apply_start_at > p_apply_end_at then
    raise exception 'INVALID_DATE_RANGE: 접수 시작일이 마감일보다 늦을 수 없습니다.';
  end if;
  if p_activity_start_at is not null and p_activity_end_at is not null and p_activity_start_at > p_activity_end_at then
    raise exception 'INVALID_DATE_RANGE: 활동 시작일이 종료일보다 늦을 수 없습니다.';
  end if;

  select coalesce((value ->> 'submissions_per_day')::int, 5) into v_limit_per_day
    from public.app_settings where key = 'activity_submission_rate_limits';
  v_limit_per_day := coalesce(v_limit_per_day, 5);

  select count(*) into v_submitted_today from public.activities
    where created_by = auth.uid() and created_at > now() - interval '1 day';
  if v_submitted_today >= v_limit_per_day then
    raise exception 'RATE_LIMITED: 하루에 제보할 수 있는 활동 수(%)를 초과했습니다.', v_limit_per_day;
  end if;

  insert into public.activities (
    title, summary, description, org_name, source_url, location_type, region,
    participation_mode, status, is_demo, created_by,
    apply_start_at, apply_end_at, activity_start_at, activity_end_at,
    source_url_resolved, apply_end_at_evidence
  ) values (
    trim(p_title), nullif(trim(p_summary), ''), nullif(trim(p_description), ''),
    nullif(trim(p_org_name), ''), v_source_url, p_location_type,
    nullif(trim(p_region), ''), p_participation_mode, 'draft', false, auth.uid(),
    p_apply_start_at, p_apply_end_at, p_activity_start_at, p_activity_end_at,
    nullif(trim(p_source_url_resolved), ''), nullif(trim(p_apply_end_at_evidence), '')
  )
  returning id into v_activity_id;

  if p_poster_hash is not null then
    insert into public.poster_analyses (
      activity_id, poster_hash, model_version, preprocessing_version, scores,
      top_class, top_score, margin, status, failure_reason, analyzed_by
    ) values (
      v_activity_id, p_poster_hash, p_model_version, p_preprocessing_version, coalesce(p_poster_scores, '[]'::jsonb),
      p_poster_top_class, p_poster_top_score, p_poster_margin, p_poster_status, p_poster_failure_reason, auth.uid()
    )
    returning id into v_analysis_id;
  end if;

  -- 제보자는 "제안"만 한다 — activity_fields(확정)가 아니라 activity_field_proposals에 담는다.
  v_accepted := coalesce(p_accepted_candidate_interest_ids, '{}'::uuid[]);

  if p_primary_interest_id is not null then
    insert into public.activity_field_proposals (activity_id, interest_id, role, source, analysis_id, proposed_by)
    values (
      v_activity_id, p_primary_interest_id, 'primary',
      case when p_primary_interest_id = any(v_accepted) then 'teachable_machine' else 'manual' end,
      case when p_primary_interest_id = any(v_accepted) then v_analysis_id else null end,
      auth.uid()
    );
  end if;

  for v_secondary_id in
    select distinct x from unnest(coalesce(p_secondary_interest_ids, '{}'::uuid[])) x
    where p_primary_interest_id is null or x <> p_primary_interest_id
  loop
    insert into public.activity_field_proposals (activity_id, interest_id, role, source, analysis_id, proposed_by)
    values (
      v_activity_id, v_secondary_id, 'secondary',
      case when v_secondary_id = any(v_accepted) then 'teachable_machine' else 'manual' end,
      case when v_secondary_id = any(v_accepted) then v_analysis_id else null end,
      auth.uid()
    );
  end loop;

  return v_activity_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. 승인 확장: 관리자가 승인 화면에서 고른 분야를 같은 호출에서 확정한다. 분석 결과는 이미
--    (제보 시점의) activity_id에 연결돼 있으므로 다시 연결할 필요가 없다(위 설계 메모 3번).
-- ---------------------------------------------------------------------------
drop function if exists public.approve_activity_submission(uuid);

create or replace function public.approve_activity_submission(
  p_activity_id uuid,
  p_primary_interest_id uuid default null,
  p_secondary_interest_ids uuid[] default '{}',
  p_accepted_candidate_interest_ids uuid[] default '{}'
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity record;
  v_latest_analysis_id uuid;
  v_accepted uuid[];
  v_secondary_id uuid;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: 운영자만 승인할 수 있습니다.';
  end if;

  select * into v_activity from public.activities where id = p_activity_id for update;
  if not found then
    raise exception 'ACTIVITY_NOT_FOUND: 활동을 찾을 수 없습니다.';
  end if;
  if v_activity.status <> 'draft' then
    raise exception 'ACTIVITY_NOT_DRAFT: 검토 대기 중인 제보가 아닙니다.';
  end if;

  update public.activities set status = 'published', last_verified_at = now() where id = p_activity_id;

  select id into v_latest_analysis_id from public.poster_analyses
    where activity_id = p_activity_id order by created_at desc limit 1;
  v_accepted := coalesce(p_accepted_candidate_interest_ids, '{}'::uuid[]);

  -- 승인 시점에 관리자가 고른 분야만 확정한다 — 제보자의 제안(activity_field_proposals)은
  -- 참고 자료일 뿐이고 그대로 복사되지 않는다(관리자가 같은 값을 골랐으면 결과적으로 같아진다).
  delete from public.activity_fields where activity_id = p_activity_id;

  if p_primary_interest_id is not null then
    insert into public.activity_fields (activity_id, interest_id, role, source, analysis_id, confirmed_by, accepted_model_candidate)
    values (
      p_activity_id, p_primary_interest_id, 'primary',
      case when p_primary_interest_id = any(v_accepted) then 'teachable_machine' else 'manual' end,
      case when p_primary_interest_id = any(v_accepted) then v_latest_analysis_id else null end,
      auth.uid(),
      case when p_primary_interest_id = any(v_accepted) then true else null end
    );
  end if;

  for v_secondary_id in
    select distinct x from unnest(coalesce(p_secondary_interest_ids, '{}'::uuid[])) x
    where p_primary_interest_id is null or x <> p_primary_interest_id
  loop
    insert into public.activity_fields (activity_id, interest_id, role, source, analysis_id, confirmed_by, accepted_model_candidate)
    values (
      p_activity_id, v_secondary_id, 'secondary',
      case when v_secondary_id = any(v_accepted) then 'teachable_machine' else 'manual' end,
      case when v_secondary_id = any(v_accepted) then v_latest_analysis_id else null end,
      auth.uid(),
      case when v_secondary_id = any(v_accepted) then true else null end
    );
  end loop;

  perform public._log_audit_action('activity_submission_approved', 'activity', p_activity_id, null);

  if v_activity.created_by is not null then
    perform public.create_notification(
      v_activity.created_by, 'activity_submission_approved', 'activity', p_activity_id,
      '제보한 활동이 승인되었어요', coalesce(v_activity.title, '활동') || ' 제보가 승인되어 공개되었습니다.',
      'activity_submission_approved:' || p_activity_id::text
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 권한 정리
-- ---------------------------------------------------------------------------
revoke all on function public.create_activity_with_fields(
  text, text, text, text, text, text, text, uuid, text, text, integer, integer, text,
  timestamptz, timestamptz, timestamptz, timestamptz, text, text, text, numeric, text, uuid[],
  uuid, uuid[], uuid[], text, text, text, jsonb, text, numeric, numeric, text, text
) from public, anon, authenticated;
grant execute on function public.create_activity_with_fields(
  text, text, text, text, text, text, text, uuid, text, text, integer, integer, text,
  timestamptz, timestamptz, timestamptz, timestamptz, text, text, text, numeric, text, uuid[],
  uuid, uuid[], uuid[], text, text, text, jsonb, text, numeric, numeric, text, text
) to authenticated;

revoke all on function public.submit_activity(
  text, text, text, text, text, text, text, text,
  timestamptz, timestamptz, timestamptz, timestamptz, text, text,
  uuid, uuid[], uuid[], text, text, text, jsonb, text, numeric, numeric, text, text
) from public, anon, authenticated;
grant execute on function public.submit_activity(
  text, text, text, text, text, text, text, text,
  timestamptz, timestamptz, timestamptz, timestamptz, text, text,
  uuid, uuid[], uuid[], text, text, text, jsonb, text, numeric, numeric, text, text
) to authenticated;

revoke all on function public.approve_activity_submission(uuid, uuid, uuid[], uuid[])
  from public, anon, authenticated;
grant execute on function public.approve_activity_submission(uuid, uuid, uuid[], uuid[])
  to authenticated;
