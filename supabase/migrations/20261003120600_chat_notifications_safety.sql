create table public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null unique references public.parties (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.chat_rooms is
  'parties에 1-1로만 연결 (수동/매칭 두 경로 모두 통합 parties를 거치므로 FK가 단일화됨). 생성 시점은 parties INSERT 트리거 (architecture.md 4장 설계 수정 #1).';

-- 이제 chat_rooms가 존재하므로, parties 생성 시 채팅방을 자동으로 만드는 트리거를 건다.
create trigger parties_create_chat_room_trg
  after insert on public.parties
  for each row execute function public.parties_create_chat_room();

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_room_id uuid not null references public.chat_rooms (id) on delete cascade,
  sender_id uuid references public.profiles (id), -- null = 시스템 메시지(팀장 변경/합류/탈퇴 등)
  message_type text not null default 'text' check (message_type in ('text', 'system')),
  body text not null check (char_length(body) between 1 and 4000),
  client_message_id text, -- 전송 재시도 중복 방지 키
  created_at timestamptz not null default now()
);

create index chat_messages_room_created_idx on public.chat_messages (chat_room_id, created_at);
create unique index chat_messages_dedupe_key
  on public.chat_messages (chat_room_id, sender_id, client_message_id)
  where client_message_id is not null;

create table public.chat_read_states (
  chat_room_id uuid not null references public.chat_rooms (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  last_read_message_id uuid references public.chat_messages (id),
  last_read_at timestamptz,
  primary key (chat_room_id, profile_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,            -- 이벤트 종류 (지원 승인/거절, 매칭 제안 등)
  target_type text,
  target_id uuid,
  title text not null,
  body text,
  dedupe_key text not null,      -- 동일 이벤트 중복 발송 방지 (architecture.md 4장 알림/신뢰·안전)
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (profile_id, dedupe_key)
);

create index notifications_profile_id_created_idx on public.notifications (profile_id, created_at desc);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id),
  target_type text not null check (target_type in ('profile', 'party', 'chat_message', 'activity')),
  target_id uuid not null,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  resolved_by uuid references public.profiles (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index reports_status_idx on public.reports (status);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id),
  action text not null,
  target_type text,
  target_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_created_at_idx on public.audit_logs (created_at desc);
