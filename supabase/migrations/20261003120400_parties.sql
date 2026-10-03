-- parties: 수동 파티와 매칭 확정 팀이 공유하는 통합 테이블 (architecture.md 4장 설계 수정 #2).
create table public.parties (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  source text not null default 'manual' check (source in ('manual', 'matching')),
  leader_id uuid references public.profiles (id),
  title text,
  description text,
  capacity smallint not null check (capacity > 0),
  meeting_mode text check (meeting_mode in ('online', 'offline', 'hybrid')),
  required_common_time jsonb,   -- 참여 조건/필요 공통 시간 요약 (MVP는 자유 형식)
  status text not null default 'recruiting'
    check (status in ('recruiting', 'full', 'confirmed', 'completed', 'cancelled')),
  recruit_deadline timestamptz,
  match_proposal_id uuid,        -- source='matching'일 때 유래한 제안 (멱등 키 / 추적용)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 매칭 경로로 생성된 파티는 recruiting/full을 거치지 않고 confirmed로 바로 생성된다.
  check (source = 'manual' or status in ('confirmed', 'completed', 'cancelled'))
);

comment on table public.parties is
  'source=manual: 사용자가 만든 파티. source=matching: match_proposals가 matched로 전환되며 생성된 팀. 둘 다 같은 구조·같은 chat_rooms FK 경로를 쓴다 (architecture.md 4장/5장).';

create index parties_activity_id_idx on public.parties (activity_id);
create index parties_leader_id_idx on public.parties (leader_id);
create unique index parties_match_proposal_id_key on public.parties (match_proposal_id) where match_proposal_id is not null;

create trigger parties_set_updated_at
  before update on public.parties
  for each row execute function public.set_updated_at();

create table public.party_role_slots (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.parties (id) on delete cascade,
  role_name text not null,
  capacity smallint not null check (capacity > 0),
  filled_count smallint not null default 0 check (filled_count >= 0),
  unique (party_id, role_name),
  check (filled_count <= capacity)
);

create table public.party_members (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.parties (id) on delete cascade,
  profile_id uuid not null references public.profiles (id),
  activity_id uuid not null, -- parties.activity_id에서 트리거로 비정규화 (4장 핵심 불변식 1)
  role_slot_id uuid references public.party_role_slots (id),
  is_leader boolean not null default false,
  is_confirmed boolean not null default false,
  status text not null default 'active' check (status in ('active', 'left', 'removed')),
  joined_at timestamptz not null default now(),
  unique (party_id, profile_id)
);

comment on table public.party_members is
  '지원 승인 즉시(= 이 행 생성 즉시) 채팅 접근 권한이 생긴다. is_confirmed/confirmed_at은 parties.status=confirmed와 별개 이벤트 (architecture.md 4장 핵심 불변식 5, 5.2절).';

-- 활동당 사용자별 "확정" 팀은 1개 (수동 파티 경로·매칭 경로 모두 이 인덱스를 거친다).
create unique index party_members_one_confirmed_per_activity
  on public.party_members (activity_id, profile_id)
  where is_confirmed = true and status = 'active';

create index party_members_profile_id_idx on public.party_members (profile_id);
create index party_members_party_id_idx on public.party_members (party_id);

create table public.party_applications (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.parties (id) on delete cascade,
  profile_id uuid not null references public.profiles (id),
  role_slot_id uuid references public.party_role_slots (id),
  message text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled', 'superseded')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

-- 동일 파티에 동시에 여러 건의 대기 지원을 할 수 없다 (재지원은 이전 건이 종료된 뒤).
create unique index party_applications_one_pending_per_party
  on public.party_applications (party_id, profile_id)
  where status = 'pending';

create index party_applications_profile_id_idx on public.party_applications (profile_id);

-- ---------------------------------------------------------------------------
-- 무결성 트리거 (데이터 정합성 레벨; 승인/거절 같은 업무 로직 자체는 3단계 서버 함수에서 구현)
-- ---------------------------------------------------------------------------

-- party_members 삽입 시 activity_id 비정규화 + is_confirmed 초기값(부모 파티가 이미 confirmed인 경우, 즉 매칭 경로) 설정.
create or replace function public.party_members_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity_id uuid;
  v_status text;
begin
  select activity_id, status into v_activity_id, v_status
  from public.parties where id = new.party_id;

  new.activity_id = v_activity_id;
  if v_status = 'confirmed' then
    new.is_confirmed = true;
  end if;

  return new;
end;
$$;

create trigger party_members_before_insert_trg
  before insert on public.party_members
  for each row execute function public.party_members_before_insert();

-- 역할 슬롯 정원 추적: 멤버가 활성 상태로 추가/제거될 때 filled_count를 갱신하고 정원을 초과하면 거부한다.
-- 마지막 자리 동시 승인은 party_role_slots 행 잠금(update ... returning)으로 직렬화된다 (4장 핵심 불변식 2).
create or replace function public.party_members_sync_slot_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.role_slot_id is not null and new.status = 'active' then
      update public.party_role_slots
         set filled_count = filled_count + 1
       where id = new.role_slot_id
         and filled_count < capacity;
      if not found then
        raise exception 'party_role_slot_full: role slot % is already full', new.role_slot_id;
      end if;
    end if;
  elsif tg_op = 'UPDATE' then
    if old.status = 'active' and new.status <> 'active' and old.role_slot_id is not null then
      update public.party_role_slots
         set filled_count = filled_count - 1
       where id = old.role_slot_id;
    elsif old.status <> 'active' and new.status = 'active' and new.role_slot_id is not null then
      update public.party_role_slots
         set filled_count = filled_count + 1
       where id = new.role_slot_id
         and filled_count < capacity;
      if not found then
        raise exception 'party_role_slot_full: role slot % is already full', new.role_slot_id;
      end if;
    end if;
  elsif tg_op = 'DELETE' then
    if old.status = 'active' and old.role_slot_id is not null then
      update public.party_role_slots
         set filled_count = filled_count - 1
       where id = old.role_slot_id;
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger party_members_sync_slot_count_trg
  after insert or update or delete on public.party_members
  for each row execute function public.party_members_sync_slot_count();

-- parties.status가 confirmed로 바뀌면 그 시점의 active 멤버를 모두 is_confirmed=true로 동기화.
create or replace function public.parties_sync_confirmed_members()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'confirmed' and old.status <> 'confirmed' then
    update public.party_members
       set is_confirmed = true
     where party_id = new.id and status = 'active';
  end if;
  return new;
end;
$$;

create trigger parties_sync_confirmed_members_trg
  after update on public.parties
  for each row execute function public.parties_sync_confirmed_members();

-- 채팅방 생성 시점 (architecture.md 4장 설계 수정 #1):
-- 파티가 생성되는 즉시 chat_rooms를 1개 만든다. confirmed 여부와 무관하며, 재생성되지 않는다(party_id UNIQUE).
create or replace function public.parties_create_chat_room()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.chat_rooms (party_id) values (new.id)
  on conflict (party_id) do nothing;
  return new;
end;
$$;
