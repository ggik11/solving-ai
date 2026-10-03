create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null default ('사용자' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
  university text not null default '상명대학교',
  campus text not null default '서울' check (campus in ('서울', '천안')),
  -- 인증·소속 플래그: 로그인(이메일 소유 확인)과 재학/소속 증명은 분리 (2장 "인증·소속 확인 원칙").
  email_verified boolean not null default false,
  affiliation_self_declared boolean not null default true,
  campus_verified boolean not null default false,
  grade smallint check (grade is null or (grade between 1 and 10)),
  bio text,
  portfolio_url text,
  profile_visibility text not null default 'members_only'
    check (profile_visibility in ('public', 'members_only', 'private')),
  account_status text not null default 'active'
    check (account_status in ('active', 'withdrawn', 'suspended')),
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  '닉네임만 공개, 이메일/학번/실명 비공개 (지시서 3장). 대학/캠퍼스/전공은 자기기입이며 email_verified/affiliation_self_declared/campus_verified로 검증 상태를 별도 관리.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- auth.users row가 생기면 최소 profiles 행을 자동 생성한다. 온보딩에서 나머지를 채운다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email_verified)
  values (new.id, new.email_confirmed_at is not null)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.affiliation_verifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  method text not null check (method in ('email_domain', 'manual')),
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create index affiliation_verifications_profile_id_idx on public.affiliation_verifications (profile_id);

-- 복수전공 지원 (온보딩: "소속(대학/캠퍼스/전공, 복수전공 가능)")
create table public.profile_majors (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  major_id uuid not null references public.majors (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (profile_id, major_id)
);

create table public.profile_interests (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  interest_id uuid not null references public.interests (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (profile_id, interest_id)
);

create table public.profile_skills (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  skill_id uuid not null references public.skills (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (profile_id, skill_id)
);

create table public.availability_slots (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0=일요일
  start_time time not null,
  end_time time not null,
  timezone text not null default 'Asia/Seoul',
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

create index availability_slots_profile_id_idx on public.availability_slots (profile_id);
