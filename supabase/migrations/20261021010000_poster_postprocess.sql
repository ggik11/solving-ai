-- 포스터 2차 후처리 P4(가이드 12장): 키워드 규칙(2-A) + 임베딩 분류(2-B) + 결합·합의 규칙을
-- poster_analyses에 기록한다. 이미 적용된 마이그레이션(20261013040000/20261013050000)은
-- 수정하지 않고 이 파일로만 추가한다.
--
-- 설계 메모:
-- - 날짜·링크·지원 자격 같은 사실관계는 여전히 사람이 원문으로 확인한다 — 이 마이그레이션은
--   "분야 후보가 어떻게 나왔는지"에 대한 신호만 남기고, 날짜·링크를 OCR이나 규칙으로 만들지
--   않는다(가이드 0장 핵심 원칙 그대로).
-- - PostgreSQL 함수 신원은 "이름 + 파라미터 타입 목록" 전체라서(20261013050000의 교훈 그대로),
--   새 선택 파라미터를 끝에 추가하는 함수(record_poster_analysis/create_activity_with_fields/
--   submit_activity)는 옛 시그니처를 먼저 명시적으로 지운 뒤 다시 만든다 — 그래야 옛 시그니처가
--   anon/authenticated 권한을 쥔 채 남지 않는다.
-- - matched_keywords는 걸린 단어 문자열 배열만 담는다(원문 전체나 OCR 텍스트는 저장하지 않는다 —
--   가이드 0장 "포스터 이미지는 저장하지 않는다" 원칙의 연장).

-- ---------------------------------------------------------------------------
-- 1. poster_analyses: 2차 후처리 신호 컬럼 추가.
-- ---------------------------------------------------------------------------
alter table public.poster_analyses
  add column postprocess_version text,
  add column keywords_version text,
  add column embed_version text,
  add column tm_top_class text,
  add column keyword_top_class text,
  add column embed_top_class text,
  add column final_top_class text,
  add column signal_agreement integer,
  add column matched_keywords jsonb;

alter table public.poster_analyses
  add constraint poster_analyses_signal_agreement_range
  check (signal_agreement is null or signal_agreement between 0 and 3);

comment on column public.poster_analyses.postprocess_version is '결합·합의 규칙 버전(가이드 12장, 예: postprocess-v1). 구버전 분석(2차 후처리 이전)은 null.';
comment on column public.poster_analyses.keywords_version is '키워드 사전 버전(가이드 12장, 예: keywords-v1). 키워드 신호가 없었으면(글자 신호 자체가 없거나 2-A를 건너뜀) null.';
comment on column public.poster_analyses.embed_version is '임베딩 분류 버전(가이드 12장, 예: embed-v1). 임베딩 신호가 없었으면(참조 세트 없음 등) null.';
comment on column public.poster_analyses.tm_top_class is '이미지 모델(TM) 단독 1위 클래스 — top_class와 별개로 "결합 전" TM만의 1위를 남긴다.';
comment on column public.poster_analyses.keyword_top_class is '키워드 규칙(2-A) 단독 1위 분야. 키워드 신호가 없었으면 null.';
comment on column public.poster_analyses.embed_top_class is '임베딩 분류(2-B) 단독 1위 분야. 임베딩 신호가 없었으면 null.';
comment on column public.poster_analyses.final_top_class is '결합 후 최종 1위 분야(top_class와 보통 같다 — top_class는 호환을 위해 그대로 두고, 이 컬럼이 "결합 결과"라는 걸 명확히 한다).';
comment on column public.poster_analyses.signal_agreement is '최종 1위와 일치하는 신호 개수(0~3, 있는 신호만 센다). 글자 신호가 없어 TM 단독 판정을 썼으면 1.';
comment on column public.poster_analyses.matched_keywords is '근거로 걸린 키워드 단어 목록만(jsonb 배열) — OCR 원문이나 포스터 이미지는 저장하지 않는다.';

-- ---------------------------------------------------------------------------
-- 2. record_poster_analysis: 2차 후처리 필드를 끝에 선택 파라미터로 추가.
-- ---------------------------------------------------------------------------
drop function if exists public.record_poster_analysis(
  uuid, text, text, text, jsonb, text, numeric, numeric, text, text
);

create or replace function public.record_poster_analysis(
  p_activity_id uuid,
  p_poster_hash text,
  p_model_version text,
  p_preprocessing_version text,
  p_scores jsonb,
  p_top_class text,
  p_top_score numeric,
  p_margin numeric,
  p_status text,
  p_failure_reason text,
  p_postprocess_version text default null,
  p_keywords_version text default null,
  p_embed_version text default null,
  p_tm_top_class text default null,
  p_keyword_top_class text default null,
  p_embed_top_class text default null,
  p_final_top_class text default null,
  p_signal_agreement integer default null,
  p_matched_keywords jsonb default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_owns boolean;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: 로그인이 필요합니다.';
  end if;
  if p_status not in ('suggested', 'needs_review', 'failed') then
    raise exception 'INVALID_STATUS: 분석 상태가 올바르지 않습니다.';
  end if;
  if p_status = 'failed' then
    if p_failure_reason is null or p_failure_reason not in ('model_missing', 'model_load_error', 'image_decode_error', 'class_map_mismatch') then
      raise exception 'INVALID_FAILURE_REASON: 실패 사유가 올바르지 않습니다.';
    end if;
  elsif p_failure_reason is not null then
    raise exception 'INVALID_FAILURE_REASON: 실패가 아닌 분석에는 실패 사유를 남길 수 없습니다.';
  end if;
  if p_signal_agreement is not null and p_signal_agreement not between 0 and 3 then
    raise exception 'INVALID_SIGNAL_AGREEMENT: signal_agreement는 0~3이어야 합니다.';
  end if;

  if p_activity_id is not null then
    select exists (
      select 1 from public.activities a
      where a.id = p_activity_id and (a.created_by = auth.uid() or public.is_admin())
    ) into v_owns;
    if not v_owns then
      raise exception 'NOT_ALLOWED: 이 활동의 분석 결과를 기록할 권한이 없습니다.';
    end if;
  end if;

  insert into public.poster_analyses (
    activity_id, poster_hash, model_version, preprocessing_version,
    scores, top_class, top_score, margin, status, failure_reason, analyzed_by,
    postprocess_version, keywords_version, embed_version,
    tm_top_class, keyword_top_class, embed_top_class, final_top_class,
    signal_agreement, matched_keywords
  ) values (
    p_activity_id, p_poster_hash, p_model_version, p_preprocessing_version,
    p_scores, p_top_class, p_top_score, p_margin, p_status, p_failure_reason, auth.uid(),
    p_postprocess_version, p_keywords_version, p_embed_version,
    p_tm_top_class, p_keyword_top_class, p_embed_top_class, p_final_top_class,
    p_signal_agreement, p_matched_keywords
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.record_poster_analysis(
  uuid, text, text, text, jsonb, text, numeric, numeric, text, text,
  text, text, text, text, text, text, text, integer, jsonb
) from public, anon, authenticated;
grant execute on function public.record_poster_analysis(
  uuid, text, text, text, jsonb, text, numeric, numeric, text, text,
  text, text, text, text, text, text, text, integer, jsonb
) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. create_activity_with_fields: 관리자 등록 — 포스터 분석 insert에 2차 후처리 필드 추가.
-- ---------------------------------------------------------------------------
drop function if exists public.create_activity_with_fields(
  text, text, text, text, text, text, text, uuid, text, text, integer, integer, text,
  timestamptz, timestamptz, timestamptz, timestamptz, text, text, text, numeric, text, uuid[],
  uuid, uuid[], uuid[], text, text, text, jsonb, text, numeric, numeric, text, text
);

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
  p_poster_failure_reason text default null,
  p_postprocess_version text default null,
  p_keywords_version text default null,
  p_embed_version text default null,
  p_tm_top_class text default null,
  p_keyword_top_class text default null,
  p_embed_top_class text default null,
  p_final_top_class text default null,
  p_signal_agreement integer default null,
  p_matched_keywords jsonb default null
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
  if p_signal_agreement is not null and p_signal_agreement not between 0 and 3 then
    raise exception 'INVALID_SIGNAL_AGREEMENT: signal_agreement는 0~3이어야 합니다.';
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
      top_class, top_score, margin, status, failure_reason, analyzed_by,
      postprocess_version, keywords_version, embed_version,
      tm_top_class, keyword_top_class, embed_top_class, final_top_class,
      signal_agreement, matched_keywords
    ) values (
      v_activity_id, p_poster_hash, p_model_version, p_preprocessing_version, coalesce(p_poster_scores, '[]'::jsonb),
      p_poster_top_class, p_poster_top_score, p_poster_margin, p_poster_status, p_poster_failure_reason, auth.uid(),
      p_postprocess_version, p_keywords_version, p_embed_version,
      p_tm_top_class, p_keyword_top_class, p_embed_top_class, p_final_top_class,
      p_signal_agreement, p_matched_keywords
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

revoke all on function public.create_activity_with_fields(
  text, text, text, text, text, text, text, uuid, text, text, integer, integer, text,
  timestamptz, timestamptz, timestamptz, timestamptz, text, text, text, numeric, text, uuid[],
  uuid, uuid[], uuid[], text, text, text, jsonb, text, numeric, numeric, text, text,
  text, text, text, text, text, text, text, integer, jsonb
) from public, anon, authenticated;
grant execute on function public.create_activity_with_fields(
  text, text, text, text, text, text, text, uuid, text, text, integer, integer, text,
  timestamptz, timestamptz, timestamptz, timestamptz, text, text, text, numeric, text, uuid[],
  uuid, uuid[], uuid[], text, text, text, jsonb, text, numeric, numeric, text, text,
  text, text, text, text, text, text, text, integer, jsonb
) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. submit_activity: 사용자 제보 — 포스터 분석 insert에 2차 후처리 필드 추가.
-- ---------------------------------------------------------------------------
drop function if exists public.submit_activity(
  text, text, text, text, text, text, text, text,
  timestamptz, timestamptz, timestamptz, timestamptz, text, text,
  uuid, uuid[], uuid[], text, text, text, jsonb, text, numeric, numeric, text, text
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
  p_poster_failure_reason text default null,
  p_postprocess_version text default null,
  p_keywords_version text default null,
  p_embed_version text default null,
  p_tm_top_class text default null,
  p_keyword_top_class text default null,
  p_embed_top_class text default null,
  p_final_top_class text default null,
  p_signal_agreement integer default null,
  p_matched_keywords jsonb default null
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
  if p_signal_agreement is not null and p_signal_agreement not between 0 and 3 then
    raise exception 'INVALID_SIGNAL_AGREEMENT: signal_agreement는 0~3이어야 합니다.';
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
      top_class, top_score, margin, status, failure_reason, analyzed_by,
      postprocess_version, keywords_version, embed_version,
      tm_top_class, keyword_top_class, embed_top_class, final_top_class,
      signal_agreement, matched_keywords
    ) values (
      v_activity_id, p_poster_hash, p_model_version, p_preprocessing_version, coalesce(p_poster_scores, '[]'::jsonb),
      p_poster_top_class, p_poster_top_score, p_poster_margin, p_poster_status, p_poster_failure_reason, auth.uid(),
      p_postprocess_version, p_keywords_version, p_embed_version,
      p_tm_top_class, p_keyword_top_class, p_embed_top_class, p_final_top_class,
      p_signal_agreement, p_matched_keywords
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

revoke all on function public.submit_activity(
  text, text, text, text, text, text, text, text,
  timestamptz, timestamptz, timestamptz, timestamptz, text, text,
  uuid, uuid[], uuid[], text, text, text, jsonb, text, numeric, numeric, text, text,
  text, text, text, text, text, text, text, integer, jsonb
) from public, anon, authenticated;
grant execute on function public.submit_activity(
  text, text, text, text, text, text, text, text,
  timestamptz, timestamptz, timestamptz, timestamptz, text, text,
  uuid, uuid[], uuid[], text, text, text, jsonb, text, numeric, numeric, text, text,
  text, text, text, text, text, text, text, integer, jsonb
) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. lookup_org_field_history: 같은 주최 기관의 활동 중 이미 확정된 분야 통계(참고 정보 전용,
--    가이드 12장 5번). 점수 계산에는 쓰지 않는다 — 화면에 "참고"로만 보여준다. 운영자 전용으로
--    제한한다 — 비공개(draft) 활동의 확정 분야까지 포함해 세므로(참고 정보로서 더 유용하다)
--    일반 사용자에게는 열지 않는다.
-- ---------------------------------------------------------------------------
create or replace function public.lookup_org_field_history(p_org_name text)
returns table (interest_id uuid, field_count integer)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: 운영자만 조회할 수 있습니다.';
  end if;

  return query
  select af.interest_id, count(*)::integer as field_count
  from public.activity_fields af
  join public.activities a on a.id = af.activity_id
  where af.role = 'primary'
    and a.org_name is not null
    and a.org_name = p_org_name
  group by af.interest_id
  order by field_count desc;
end;
$$;

revoke all on function public.lookup_org_field_history(text) from public, anon, authenticated;
grant execute on function public.lookup_org_field_history(text) to authenticated;
