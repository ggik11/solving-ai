-- Reference data: majors, interests, skills
-- Operator-editable, not a fixed enum (9장: 서울캠퍼스 전공 전체 명칭 미확보 -> 운영자 편집 가능 테이블).
create table public.majors (
  id uuid primary key default gen_random_uuid(),
  college text not null,          -- 단과대학
  department text not null,       -- 학부(과)
  name text not null,             -- 전공명
  is_demo boolean not null default false,  -- 데모/샘플 표시 플래그
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (college, department, name)
);

create trigger majors_set_updated_at
  before update on public.majors
  for each row execute function public.set_updated_at();

create table public.interests (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- user_roles: 관리자 권한을 profiles(자기수정 가능 입력값)과 분리된 테이블로 관리.
create table public.user_roles (
  profile_id uuid primary key,
  role text not null check (role in ('admin')),
  granted_by uuid,
  granted_at timestamptz not null default now()
);

comment on table public.user_roles is
  '관리자 권한 전용 테이블. 일반 사용자는 자신의 행도 수정할 수 없고 is_admin()으로만 참조된다.';

-- app_settings: 운영자가 조정하는 설정값 (허용 이메일 도메인, 추천 가중치, 매칭 수락 기한 등).
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);

create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

-- Admin check used throughout RLS policies.
-- SECURITY DEFINER so a regular user's RLS evaluation can read user_roles
-- (which itself only grants SELECT on the caller's own row) without a recursive
-- policy problem. user_roles가 바로 위에서 생성되었으므로 여기서 정의한다.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.profile_id = auth.uid() and ur.role = 'admin'
  );
$$;

comment on function public.is_admin() is
  '현재 요청 사용자가 user_roles에 admin으로 등록되어 있는지 확인. RLS 정책 전역에서 사용.';

insert into public.app_settings (key, value, description) values
  ('allowed_email_domains', '["smu.ac.kr"]'::jsonb,
   '서울캠퍼스 소속 자기기입 확인에 쓰는 허용 이메일 도메인 목록. 도메인 정책 공식 확인 전까지 운영자가 편집.'),
  ('recommendation_weights', '{"interest":35,"preferred_activity_type":20,"major_relevance":15,"region_mode":15,"duration_time_fit":15}'::jsonb,
   '추천 계산 기본 가중치 (지시서 6장/architecture.md 7장). 합계 100.'),
  ('matching_acceptance_hours', '24'::jsonb,
   '빠른 매칭 제안의 기본 수락 기한(시간). 지시서 7장 B 항목 7.');
