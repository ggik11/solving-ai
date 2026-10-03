create table public.activities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  org_name text,
  source_url text,                 -- 원문 사이트 링크 (지원 대행 없음)
  location_type text not null default 'offline'
    check (location_type in ('online', 'offline', 'hybrid')),
  region text,
  apply_start_at timestamptz,
  apply_end_at timestamptz,
  activity_start_at timestamptz,
  activity_end_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'closed', 'archived')),
  is_demo boolean not null default false,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (apply_end_at is null or apply_start_at is null or apply_end_at >= apply_start_at),
  check (activity_end_at is null or activity_start_at is null or activity_end_at >= activity_start_at)
);

comment on table public.activities is
  '활동 지원 자체는 원문 사이트로 안내. 플랫폼은 팀 합류만 중개 (지시서 7장 서문).';

create index activities_status_idx on public.activities (status);
create index activities_apply_end_at_idx on public.activities (apply_end_at);

create trigger activities_set_updated_at
  before update on public.activities
  for each row execute function public.set_updated_at();

create table public.activity_tags (
  activity_id uuid not null references public.activities (id) on delete cascade,
  tag text not null,
  primary key (activity_id, tag)
);

create table public.bookmarks (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  activity_id uuid not null references public.activities (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, activity_id)
);
