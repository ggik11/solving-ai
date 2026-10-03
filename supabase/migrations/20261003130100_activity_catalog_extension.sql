-- 2-B(화면) 작업 중 발견한 스키마 공백을 메운다. 지시서 4장(희망 활동)·5장(활동 데이터 필드)이
-- 요구하는 "희망 활동 유형", "지원 자격", "개인/팀 참여 여부", "팀 최소·최대 인원",
-- "마지막 확인 시각" 등은 2-A 마이그레이션에 없었다.

create table public.activity_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.activity_types is
  '희망 활동 유형 참조 테이블(공모전/서포터즈/봉사/해커톤/창업/교육·캠프 등, 지시서 4장). 활동의 "유형" 필드도 여기를 참조한다.';

alter table public.activities
  add column activity_type_id uuid references public.activity_types (id),
  add column summary text,                -- 한 줄 요약
  add column eligibility text,             -- 지원 자격
  add column participation_mode text not null default 'both'
    check (participation_mode in ('solo', 'team', 'both')), -- 개인/팀 참여 여부
  add column team_min_size smallint check (team_min_size is null or team_min_size > 0),
  add column team_max_size smallint check (team_max_size is null or team_max_size >= team_min_size),
  add column benefit text,                 -- 비용·혜택
  add column last_verified_at timestamptz; -- 마지막 확인 시각 ("원문 확인 필요" 배지 판단용)

create index activities_activity_type_id_idx on public.activities (activity_type_id);

create table public.profile_preferred_activity_types (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  activity_type_id uuid not null references public.activity_types (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (profile_id, activity_type_id)
);

alter table public.activity_types enable row level security;
alter table public.profile_preferred_activity_types enable row level security;

create policy activity_types_select on public.activity_types for select using (true);
create policy activity_types_write_insert on public.activity_types for insert with check (public.is_admin());
create policy activity_types_write_update on public.activity_types for update using (public.is_admin()) with check (public.is_admin());
create policy activity_types_write_delete on public.activity_types for delete using (public.is_admin());

create policy profile_preferred_activity_types_select on public.profile_preferred_activity_types for select
  using (profile_id = auth.uid() or public.is_admin());
create policy profile_preferred_activity_types_insert on public.profile_preferred_activity_types for insert
  with check (profile_id = auth.uid());
create policy profile_preferred_activity_types_delete on public.profile_preferred_activity_types for delete
  using (profile_id = auth.uid());
