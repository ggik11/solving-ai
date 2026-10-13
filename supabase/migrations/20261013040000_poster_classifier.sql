-- G3: 티처블 머신 연동 골격(모델 없이). docs/teachable-machine-integration.md 3.5/3.6/3.7, 9장 G3.
-- 범위: poster_analyses(분석 결과 저장), model_class_field_map(모델 클래스 -> 서비스 분야 후보),
-- app_settings.poster_classifier(판정 임계값·모델 경로 설정), activity_fields.analysis_id FK 연결.
--
-- 설계 메모 (11장에 추가할 사항):
-- - 원 설계(3.5)는 poster_analyses에 activity_id와 submission_id를 분리해 두지만, 이 저장소는
--   사용자 제보도 activities 테이블의 draft 행으로 재사용한다(5-A단계 설계 그대로) — 제보 역시
--   언젠가는 activities.id를 갖는다. submission_id를 따로 두면 "제보가 activities다"라는 기존
--   결정과 중복되는 컬럼이 영원히 비어 있게 되므로, 이 구현에서는 submission_id 컬럼을 두지 않고
--   activity_id 하나로 두 경우(관리자 등록/사용자 제보)를 모두 표현한다.
-- - "활동 등록 전 분석"(activity_id가 아직 없는 경우)은 스키마·함수 모두 지원하지만(이번 마이그레이션의
--   record_poster_analysis/find_cached_poster_analysis가 activity_id=null을 받는다), 실제 화면
--   연동은 활동이 이미 존재하는 수정 화면(PosterClassifierPanel의 "confirm" 모드)에만 둔다 —
--   "관리자가 등록한 실제 활동은 관리자가 직접 확정한다"는 원칙을 지키는 확정 지점을 한 곳(수정
--   화면의 ActivityFieldsManager)으로 모으기 위한 의도적 선택이다. 등록/제보 단계의
--   PosterClassifierPanel은 미리보기만 하고 DB에 쓰지 않는다 — 자세한 내용은 PROGRESS.md 참조.

-- ---------------------------------------------------------------------------
-- 1. poster_analyses: 포스터 분석 결과(점수·판정만 저장, 이미지 자체는 저장하지 않는다 — 원칙 5).
-- ---------------------------------------------------------------------------
create table public.poster_analyses (
  id uuid primary key default gen_random_uuid(),
  -- 활동 등록 전 분석이면 null, 등록 시 연결한다(가이드 3.5). 사용자 제보도 activities의 draft
  -- 행이라 같은 컬럼을 쓴다(위 설계 메모 참조).
  activity_id uuid references public.activities (id) on delete cascade,
  poster_hash text not null,
  model_version text not null,
  preprocessing_version text not null,
  -- 전체 클래스 ID와 점수(가이드 3.5) — 실패 상태일 때는 빈 배열/객체일 수 있다.
  scores jsonb not null,
  top_class text,
  top_score numeric,
  margin numeric,
  status text not null check (status in ('suggested', 'needs_review', 'failed')),
  failure_reason text check (
    failure_reason is null
    or failure_reason in ('model_missing', 'model_load_error', 'image_decode_error', 'class_map_mismatch')
  ),
  analyzed_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint poster_analyses_failure_reason_matches_status
    check ((status = 'failed') = (failure_reason is not null))
);

comment on table public.poster_analyses is
  '포스터 분석 결과(점수·판정·모델/전처리 버전). 이미지 자체는 저장하지 않는다(원칙 5). 확정 분야(activity_fields)와는 별개 — 모델 후보일 뿐이다(가이드 3.5, 체크리스트 8번).';
comment on column public.poster_analyses.scores is '전체 클래스 ID -> 점수. 실패 상태를 점수 0이나 특정 분야로 저장하지 않는다.';

create index poster_analyses_activity_id_idx on public.poster_analyses (activity_id);
create index poster_analyses_cache_lookup_idx on public.poster_analyses (poster_hash, model_version, preprocessing_version);

alter table public.poster_analyses enable row level security;

-- 관리자는 전체 조회, 그 외에는 자신이 분석했거나(analyzed_by) 자신이 만든 활동/제보에 연결된
-- 행만 조회한다(가이드 3.5). 쓰기는 아래 함수로만 한다 — insert/update/delete 정책을 두지 않는다.
create policy poster_analyses_select on public.poster_analyses for select
  using (
    public.is_admin()
    or analyzed_by = auth.uid()
    or exists (
      select 1 from public.activities a
      where a.id = poster_analyses.activity_id and a.created_by = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 2. model_class_field_map: 모델 클래스 -> 서비스 분야 "후보" 연결표(가이드 3.6). 모델 버전별로 둔다.
-- ---------------------------------------------------------------------------
create table public.model_class_field_map (
  id uuid primary key default gen_random_uuid(),
  model_version text not null,
  class_id text not null,
  interest_id uuid not null references public.interests (id),
  created_at timestamptz not null default now(),
  unique (model_version, class_id, interest_id)
);

comment on table public.model_class_field_map is
  '모델 클래스 -> 서비스 분야 후보 연결표(가이드 3.6). 한 클래스가 여러 후보로 연결될 수 있다. 실제 모델이 배포되기 전까지는 빈 테이블이며, 매핑이 없는 모델 버전이 로드되면 화면이 "연결표 없음"으로 후보 제안을 끈다.';

create index model_class_field_map_model_version_idx on public.model_class_field_map (model_version);

alter table public.model_class_field_map enable row level security;

create policy model_class_field_map_select on public.model_class_field_map for select using (true);
create policy model_class_field_map_write_insert on public.model_class_field_map for insert with check (public.is_admin());
create policy model_class_field_map_write_update on public.model_class_field_map for update using (public.is_admin()) with check (public.is_admin());
create policy model_class_field_map_write_delete on public.model_class_field_map for delete using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. activity_fields.analysis_id: G2에서 FK 없이 둔 컬럼에 이제 FK를 건다. 분석이 지워져도
--    이미 확정된 분야는 남아야 하므로 on delete set null — 재분석이 확정값을 바꾸지 않는다(체크리스트 8번).
-- ---------------------------------------------------------------------------
alter table public.activity_fields
  add constraint activity_fields_analysis_id_fkey
  foreign key (analysis_id) references public.poster_analyses (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 4. app_settings: poster_classifier 설정(가이드 3.7). 모델 파일이 없는 동안에도 설정값은
--    존재해야 판정 임계값 등을 화면이 app_settings 하나만 보고 읽을 수 있다.
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value, description) values
  ('poster_classifier',
   '{
     "enabled": true,
     "suggest_min_top_score": 0.80,
     "suggest_min_margin": 0.20,
     "model_path": "/models/poster-classifier/"
   }'::jsonb,
   '포스터 분류 모델 설정(G3, 가이드 3.7/5.5). model_path에 모델 파일이 없으면 분석은 항상 failed(model_missing)로 끝나고 수동 선택으로 넘어간다 — 이 자체가 정상 동작이다(체크리스트 6번).')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 5. 포스터 분석 기록/조회 함수. 포스터 이미지 자체는 함수에도 전달하지 않는다 — 브라우저가
--    이미 계산한 해시·점수만 받는다.
-- ---------------------------------------------------------------------------

-- 같은 (활동, 해시, 모델 버전, 전처리 버전) 분석이 이미 있으면 재사용한다(가이드 3.5). 활동이
-- 아직 없는 분석(activity_id null)은 같은 사용자가 만든 것만 재사용 대상으로 본다 — 서로 다른
-- 사용자의 "등록 전" 분석을 섞지 않기 위해서다.
-- setof로 선언한다 — 단일 컴포지트 반환(returns public.poster_analyses)은 매치가 없을 때도
-- PostgREST에 "필드가 전부 null인 행 1개"로 직렬화돼 "캐시 있음"과 구분되지 않는다. setof는
-- 매치가 없으면 진짜 0행을 반환한다.
create or replace function public.find_cached_poster_analysis(
  p_activity_id uuid,
  p_poster_hash text,
  p_model_version text,
  p_preprocessing_version text
) returns setof public.poster_analyses
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: 로그인이 필요합니다.';
  end if;

  return query
  select * from public.poster_analyses
  where poster_hash = p_poster_hash
    and model_version = p_model_version
    and preprocessing_version = p_preprocessing_version
    and (
      (p_activity_id is not null and activity_id = p_activity_id)
      or (p_activity_id is null and activity_id is null and analyzed_by = auth.uid())
    )
  order by created_at desc
  limit 1;
end;
$$;

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
  p_failure_reason text
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
    scores, top_class, top_score, margin, status, failure_reason, analyzed_by
  ) values (
    p_activity_id, p_poster_hash, p_model_version, p_preprocessing_version,
    p_scores, p_top_class, p_top_score, p_margin, p_status, p_failure_reason, auth.uid()
  )
  returning id into v_id;

  return v_id;
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
    'find_cached_poster_analysis(uuid, text, text, text)',
    'record_poster_analysis(uuid, text, text, text, jsonb, text, numeric, numeric, text, text)'
  ]
  loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end;
$$;
