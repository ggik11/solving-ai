create table public.matching_queue (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  profile_id uuid not null references public.profiles (id),
  template_role text not null,          -- 참가 희망 역할 (활동별 템플릿 중 하나)
  willing_leader boolean not null default false, -- 팀장 사전 동의
  continue_on_fail boolean not null default false, -- "실패하면 계속 찾기" 사전 동의
  status text not null default 'waiting'
    check (status in ('waiting', 'proposed', 'matched', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.matching_queue is
  '명시적으로 매칭에 동의한 사용자만 대상 (지시서 7장 B 항목 2). 실제 후보 편성·전체 공통시간 교집합 계산은 4단계 워커에서 구현.';

-- 활동당 사용자별로 진행 중인 대기열 항목은 1개(waiting 또는 proposed)만 허용.
create unique index matching_queue_one_active_per_activity
  on public.matching_queue (activity_id, profile_id)
  where status in ('waiting', 'proposed');

create trigger matching_queue_set_updated_at
  before update on public.matching_queue
  for each row execute function public.set_updated_at();

create table public.match_proposals (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  status text not null default 'proposed'
    check (status in ('proposed', 'matched', 'expired', 'cancelled')),
  proposed_leader_profile_id uuid references public.profiles (id),
  expires_at timestamptz not null,
  party_id uuid references public.parties (id), -- matched 전환 시 생성된 통합 파티 (멱등 키)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.match_proposals is
  'matched 전환 시 parties(source=matching, status=confirmed) 1행을 생성하고 party_id에 기록해 재실행 시 중복 생성을 막는다 (architecture.md 5.4절).';

create unique index match_proposals_party_id_key on public.match_proposals (party_id) where party_id is not null;
create index match_proposals_activity_id_idx on public.match_proposals (activity_id);

create trigger match_proposals_set_updated_at
  before update on public.match_proposals
  for each row execute function public.set_updated_at();

create table public.match_proposal_members (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.match_proposals (id) on delete cascade,
  profile_id uuid not null references public.profiles (id),
  queue_id uuid references public.matching_queue (id),
  role_name text not null,
  response text not null default 'pending' check (response in ('pending', 'accepted', 'declined')),
  responded_at timestamptz,
  unique (proposal_id, profile_id)
);

create index match_proposal_members_profile_id_idx on public.match_proposal_members (profile_id);
