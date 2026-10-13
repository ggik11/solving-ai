-- G2: 추천 개편과 자격 분리. docs/teachable-machine-integration.md 3.2/3.4/3.7, 9장 G2.
-- 범위: activity_fields(관리자 확정 분야), activities.eligibility_*(지원 자격, 전공 관련성과 분리),
-- app_settings.recommendation_modes(모드별 가중치).

-- ---------------------------------------------------------------------------
-- 1. activity_fields: 관리자가 확정한 활동의 서비스 분야(대표 1개 + 부가 여러 개).
--    추천 계산에는 이 테이블만 쓴다 — activity_tags는 자유 키워드로 남긴다(3.2).
-- ---------------------------------------------------------------------------
create table public.activity_fields (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  interest_id uuid not null references public.interests(id),
  role text not null check (role in ('primary', 'secondary')),
  source text not null check (source in ('manual', 'teachable_machine', 'import')),
  -- G3(poster_analyses)가 생기기 전까지는 FK 없이 둔다 — G3 마이그레이션에서 FK 제약을 추가한다.
  analysis_id uuid,
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (activity_id, interest_id)
);

create unique index activity_fields_one_primary_per_activity
  on public.activity_fields (activity_id)
  where role = 'primary';

create index activity_fields_activity_id_idx on public.activity_fields (activity_id);
create index activity_fields_interest_id_idx on public.activity_fields (interest_id);

comment on table public.activity_fields is
  '관리자가 확정한 활동의 서비스 분야. 추천 계산(src/lib/recommend.ts)의 유일한 분야 입력이며, 확정되지 않은 모델 후보는 쓰지 않는다 (가이드 3.2).';

alter table public.activity_fields enable row level security;

create policy activity_fields_select on public.activity_fields for select
  using (
    exists (
      select 1 from public.activities a
      where a.id = activity_fields.activity_id
        and (a.status = 'published' or a.created_by = auth.uid() or public.is_admin())
    )
  );
create policy activity_fields_write_insert on public.activity_fields for insert with check (public.is_admin());
create policy activity_fields_write_update on public.activity_fields for update using (public.is_admin()) with check (public.is_admin());
create policy activity_fields_write_delete on public.activity_fields for delete using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. activities: 지원 자격(eligibility_scope 등) — 전공 관련성과 분리한다(3.4, 8.4).
--    전공 연결표(major_field_weights)로는 지원 가능 여부를 판단하지 않는다.
-- ---------------------------------------------------------------------------
alter table public.activities
  add column eligibility_scope text not null default 'unknown'
    check (eligibility_scope in ('any', 'restricted', 'unknown')),
  add column eligible_major_ids uuid[] not null default '{}'::uuid[],
  add column eligibility_verified_at timestamptz;

alter table public.activities add constraint activities_restricted_requires_majors
  check (eligibility_scope <> 'restricted' or coalesce(array_length(eligible_major_ids, 1), 0) > 0);

comment on column public.activities.eligibility_scope is
  '지원 자격 범위: any(전공 무관) / restricted(지정 전공) / unknown(확인 필요, 기본). 원문으로 확인한 조건만 적용한다 (가이드 3.4, 8.4).';
comment on column public.activities.eligible_major_ids is
  'eligibility_scope=restricted일 때 원문에 명시된 지정 전공(majors.id). 배열 요소에는 FK를 걸 수 없어 애플리케이션에서 유효성을 확인한다.';
comment on column public.activities.eligibility_verified_at is
  '지원 자격을 원문으로 확인한 시각.';

-- ---------------------------------------------------------------------------
-- 3. app_settings: recommendation_modes(3.7). 기존 recommendation_weights는
--    더 이상 읽지 않지만(4장) 과거 기록 보존을 위해 지우지 않고 설명만 갱신한다.
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value, description) values
  ('recommendation_modes',
   '{
     "version": "v1",
     "balanced":        {"interest": 0.30, "major": 0.25, "activity_type": 0.15, "participation": 0.10, "time": 0.10, "goal": 0.10},
     "major_focus":     {"interest": 0.15, "major": 0.40, "activity_type": 0.15, "participation": 0.10, "time": 0.10, "goal": 0.10},
     "interest_expand": {"interest": 0.45, "major": 0.10, "activity_type": 0.15, "participation": 0.10, "time": 0.10, "goal": 0.10},
     "no_major":        {"interest": 0.55, "major": 0.00, "activity_type": 0.15, "participation": 0.10, "time": 0.10, "goal": 0.10}
   }'::jsonb,
   '추천 모드별 가중치(G2, docs/teachable-machine-integration.md 3.7/4장). 각 모드 가중치 합계는 1이다.')
on conflict (key) do update set value = excluded.value, description = excluded.description;

update public.app_settings
  set description = '과거 추천 가중치(100점 척도) — G2부터 recommendation_modes로 대체되어 더 이상 읽지 않음. 기록 보존용.'
  where key = 'recommendation_weights';
