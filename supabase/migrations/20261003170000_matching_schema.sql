-- 4-B단계: 빠른 매칭 스키마 (지시서 7장 B, architecture.md 5.3~5.5절).
--
-- 설계 메모:
-- - 역할 구성 템플릿은 party_role_slots와 같은 모양({role_name, capacity})을 쓴다
--   (architecture.md 5.5절 1번). matched 전환 시 이 템플릿을 그대로 복제해 party_role_slots를
--   만든다.
-- - matching_queue는 기존 20261003120500에서 단일 template_role 컬럼으로 만들어졌으나, 지시서
--   7장 B("수행 가능한 역할 복수 선택 가능, 배정은 1슬롯")를 따르려면 "지원 가능한 역할 목록"과
--   "배정된 템플릿"을 분리해야 한다. 아직 어떤 애플리케이션 코드도 이 컬럼을 쓰지 않으므로
--   (4단계 전체가 "다음 단계"로 남아 있었다) 데이터 마이그레이션 없이 컬럼을 바꾼다.

-- ---------------------------------------------------------------------------
-- 1. 활동별 역할 구성 템플릿
-- ---------------------------------------------------------------------------
create table public.activity_match_templates (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index activity_match_templates_activity_id_idx on public.activity_match_templates (activity_id);

create table public.activity_match_template_roles (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.activity_match_templates (id) on delete cascade,
  role_name text not null,
  capacity smallint not null check (capacity > 0),
  unique (template_id, role_name)
);

comment on table public.activity_match_templates is
  '운영자가 활동에 지정하는 매칭용 역할 구성(예: 기획1+개발2+디자인1). party_role_slots와 같은
   {role_name, capacity} 모양을 써서 matched 전환 시 그대로 복제한다 (architecture.md 5.5절).';

-- ---------------------------------------------------------------------------
-- 2. matching_queue 스키마 조정: 단일 template_role → template_id + eligible_roles(복수)
-- ---------------------------------------------------------------------------
alter table public.matching_queue
  add column template_id uuid references public.activity_match_templates (id),
  add column eligible_roles text[];

update public.matching_queue set eligible_roles = array[template_role] where eligible_roles is null;

alter table public.matching_queue
  alter column eligible_roles set not null,
  add constraint matching_queue_eligible_roles_not_empty check (array_length(eligible_roles, 1) > 0);

alter table public.matching_queue drop column template_role;

comment on column public.matching_queue.eligible_roles is
  '지원자가 수행 가능하다고 체크한 역할 목록(복수 선택 가능). 실제 배정은 제안 시점에 1개로 확정된다.';

-- match_proposals에도 어떤 템플릿으로 편성됐는지 남겨 디버깅·화면 표시에 쓴다.
alter table public.match_proposals add column template_id uuid references public.activity_match_templates (id);

-- ---------------------------------------------------------------------------
-- 3. 매칭 설정값 (app_settings)
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value, description) values
  ('matching_settings', jsonb_build_object(
    'min_common_minutes', 60,
    'max_candidates_per_search', 30,
    'max_backtrack_steps', 500,
    'proposal_expiry_hours', 24,
    'required_campus', '서울',
    'bookmark_deadline_hours', 48
  ), '빠른 매칭 워커 설정: 최소 공통시간(분), 탐색 후보 수/백트래킹 상한, 제안 수락 기한(시간), 매칭 대상 캠퍼스, 북마크 마감임박 알림 기준(시간).')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------
alter table public.activity_match_templates enable row level security;
alter table public.activity_match_template_roles enable row level security;

create policy activity_match_templates_select on public.activity_match_templates for select
  using (
    is_active and exists (select 1 from public.activities a where a.id = activity_id and a.status = 'published')
    or public.is_admin()
  );
create policy activity_match_templates_write_insert on public.activity_match_templates for insert with check (public.is_admin());
create policy activity_match_templates_write_update on public.activity_match_templates for update using (public.is_admin()) with check (public.is_admin());
create policy activity_match_templates_write_delete on public.activity_match_templates for delete using (public.is_admin());

create policy activity_match_template_roles_select on public.activity_match_template_roles for select
  using (
    exists (
      select 1 from public.activity_match_templates t
      join public.activities a on a.id = t.activity_id
      where t.id = template_id and (t.is_active and a.status = 'published' or public.is_admin())
    )
  );
create policy activity_match_template_roles_write_insert on public.activity_match_template_roles for insert with check (public.is_admin());
create policy activity_match_template_roles_write_update on public.activity_match_template_roles for update using (public.is_admin()) with check (public.is_admin());
create policy activity_match_template_roles_write_delete on public.activity_match_template_roles for delete using (public.is_admin());

-- matching_queue/match_proposal_members: 일반 사용자가 직접 쓰지 못하게 좁히고 DB 함수(다음
-- 마이그레이션)만 거치게 한다. match_proposals는 이미 20261003120700에서 운영자 전용이다.
drop policy if exists matching_queue_insert on public.matching_queue;
create policy matching_queue_insert on public.matching_queue for insert with check (public.is_admin());

drop policy if exists matching_queue_update on public.matching_queue;
create policy matching_queue_update on public.matching_queue for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists match_proposal_members_update on public.match_proposal_members;
create policy match_proposal_members_update on public.match_proposal_members for update using (public.is_admin()) with check (public.is_admin());
