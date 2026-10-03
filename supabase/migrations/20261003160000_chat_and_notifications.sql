-- 4-A단계: 팀 채팅(DB 영구 저장 + Realtime + 읽음 상태) + 앱 내 알림.
--
-- 설계 메모:
-- - 메시지 전송/읽음 처리도 파티 함수와 같은 패턴(SECURITY DEFINER + auth.uid() 기반 권한 체크)을
--   따른다. chat_messages/chat_read_states의 INSERT/UPDATE RLS를 운영자 전용으로 좁혀, 일반
--   사용자는 반드시 send_chat_message/mark_chat_read를 거치도록 강제한다(빈도 제한·멱등 재시도·
--   "보고 있으면 알림 생략"을 raw INSERT로 우회할 수 없게 함).
-- - Realtime은 private 채널(= RLS로 구독 인가를 검사)로만 전달한다. chat_messages를
--   supabase_realtime 발행(publication)에 추가해야 Postgres Changes 이벤트가 나간다.
--   탈퇴/강퇴된 사용자는 chat_messages_select RLS(is_party_member)가 더 이상 통과하지
--   않으므로 이후 이벤트를 받지 못한다 — 추가로 클라이언트가 주기적으로 mark_chat_read를
--   호출(하트비트)하다가 NOT_A_MEMBER를 받으면 스스로 구독을 끊도록 해 "이미 열려 있는 연결"
--   케이스도 능동적으로 방어한다(architecture.md 참고).
-- - "채팅방을 보고 있으면 새 메시지 알림을 만들지 않는다"는 완벽한 실시간 presence 추적 없이는
--   정확히 구현할 수 없다. 대신 chat_read_states.last_read_at을 하트비트로 활용한다: 클라이언트가
--   방을 보는 동안 주기적으로 mark_chat_read를 호출해 last_read_at을 갱신하고, 메시지 전송 시
--   "최근(30초 이내) last_read_at을 가진 멤버"는 알림 생성에서 제외한다. 완벽하진 않지만(최대
--   30초의 오차) 버튼을 숨기는 식이 아닌 서버 쪽 근사치 판정이다.
-- - 새 채팅 알림은 메시지마다 쌓지 않고 방 단위 dedupe_key로 upsert한다(이미 읽은 뒤 새로
--   도착하면 read_at을 다시 null로 되돌려 "새로 안 읽음"으로 되살린다).

-- ---------------------------------------------------------------------------
-- 0. Realtime publication — chat_messages의 INSERT 이벤트를 Postgres Changes로 내보낸다.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.chat_messages;

-- ---------------------------------------------------------------------------
-- 1. 빈도 제한 설정값 (지시서: "전송 빈도 제한")
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value, description) values
  ('chat_rate_limits', '{"messages_per_minute": 20}'::jsonb,
   '채팅 메시지 전송 빈도 제한(스팸 방지). 사용자별 분당 허용 전송 수.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. RLS 강화: 일반 사용자는 chat_messages/chat_read_states를 직접 쓸 수 없다.
--    (아래 함수들이 SECURITY DEFINER로 검증 후 실제 쓰기를 수행한다.)
-- ---------------------------------------------------------------------------
drop policy if exists chat_messages_insert on public.chat_messages;
create policy chat_messages_insert on public.chat_messages for insert with check (public.is_admin());

drop policy if exists chat_read_states_insert on public.chat_read_states;
create policy chat_read_states_insert on public.chat_read_states for insert with check (public.is_admin());

drop policy if exists chat_read_states_update on public.chat_read_states;
create policy chat_read_states_update on public.chat_read_states for update using (public.is_admin()) with check (public.is_admin());

-- notifications: 읽음 처리도 함수 경유로 강제한다(임의 컬럼 변조 방지).
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. 시스템 메시지 삽입 헬퍼 (외부에 공개하지 않음 — 파티 함수들이 내부에서 호출).
-- ---------------------------------------------------------------------------
create or replace function public.insert_system_chat_message(p_party_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id uuid;
begin
  select id into v_room_id from public.chat_rooms where party_id = p_party_id;
  if v_room_id is null then
    return;
  end if;

  insert into public.chat_messages (chat_room_id, sender_id, message_type, body)
  values (v_room_id, null, 'system', p_body);
end;
$$;

revoke all on function public.insert_system_chat_message(uuid, text) from public;

-- ---------------------------------------------------------------------------
-- 4. 메시지 전송 — 텍스트만 허용(시스템 메시지는 이 함수를 거치지 않음), 길이·빈도 제한,
--    client_message_id로 멱등 재시도(이미 저장된 경우 그 id를 그대로 반환), 전송 즉시
--    같은 파티의 다른 활성 멤버에게 "방 단위" 알림을 upsert한다(현재 보고 있는 멤버는 제외).
-- ---------------------------------------------------------------------------
create or replace function public.send_chat_message(
  p_chat_room_id uuid,
  p_client_message_id text,
  p_body text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_party_id uuid;
  v_party_title text;
  v_body text;
  v_existing_id uuid;
  v_new_id uuid;
  v_limit_per_minute int;
  v_sent_this_minute int;
  v_sender_nickname text;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: 로그인이 필요합니다.';
  end if;
  if p_client_message_id is null or trim(p_client_message_id) = '' then
    raise exception 'INVALID_CLIENT_MESSAGE_ID: client_message_id가 필요합니다.';
  end if;

  v_body := trim(coalesce(p_body, ''));
  if char_length(v_body) = 0 then
    raise exception 'EMPTY_MESSAGE: 메시지 내용을 입력해 주세요.';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'MESSAGE_TOO_LONG: 메시지는 2000자 이하로 입력해 주세요.';
  end if;

  select party_id into v_party_id from public.chat_rooms where id = p_chat_room_id;
  if v_party_id is null then
    raise exception 'CHAT_ROOM_NOT_FOUND: 채팅방을 찾을 수 없습니다.';
  end if;

  if not exists (
    select 1 from public.party_members
    where party_id = v_party_id and profile_id = auth.uid() and status = 'active'
  ) then
    raise exception 'NOT_A_MEMBER: 이 채팅방에 메시지를 보낼 수 없습니다.';
  end if;

  -- 재시도 멱등성: 이미 같은 client_message_id로 저장된 메시지가 있으면 새로 만들지 않고 그대로 반환.
  select id into v_existing_id from public.chat_messages
  where chat_room_id = p_chat_room_id and sender_id = auth.uid() and client_message_id = p_client_message_id;
  if v_existing_id is not null then
    return v_existing_id;
  end if;

  select coalesce((value ->> 'messages_per_minute')::int, 20) into v_limit_per_minute
    from public.app_settings where key = 'chat_rate_limits';
  v_limit_per_minute := coalesce(v_limit_per_minute, 20);

  select count(*) into v_sent_this_minute from public.chat_messages
    where sender_id = auth.uid() and created_at > now() - interval '1 minute';
  if v_sent_this_minute >= v_limit_per_minute then
    raise exception 'RATE_LIMITED: 분당 보낼 수 있는 메시지 수(%)를 초과했습니다.', v_limit_per_minute;
  end if;

  insert into public.chat_messages (chat_room_id, sender_id, message_type, body, client_message_id)
  values (p_chat_room_id, auth.uid(), 'text', v_body, p_client_message_id)
  on conflict (chat_room_id, sender_id, client_message_id) where client_message_id is not null do nothing
  returning id into v_new_id;

  if v_new_id is null then
    -- 동시 재시도 경쟁(같은 client_message_id가 그 사이에 먼저 들어간 경우): 저장된 id를 반환.
    select id into v_new_id from public.chat_messages
    where chat_room_id = p_chat_room_id and sender_id = auth.uid() and client_message_id = p_client_message_id;
    return v_new_id;
  end if;

  select title into v_party_title from public.parties where id = v_party_id;
  select nickname into v_sender_nickname from public.profiles where id = auth.uid();

  insert into public.notifications (profile_id, type, target_type, target_id, title, body, dedupe_key, created_at, read_at)
  select
    pm.profile_id, 'chat_new_message', 'chat_room', p_chat_room_id,
    coalesce(v_party_title, '팀 채팅') || ' 새 메시지',
    coalesce(v_sender_nickname, '멤버') || ': ' || left(v_body, 80),
    'chat_new_message:' || p_chat_room_id::text,
    now(), null
  from public.party_members pm
  where pm.party_id = v_party_id and pm.status = 'active' and pm.profile_id <> auth.uid()
    and not exists (
      select 1 from public.chat_read_states crs
      where crs.chat_room_id = p_chat_room_id and crs.profile_id = pm.profile_id
        and crs.last_read_at > now() - interval '30 seconds'
    )
  on conflict (profile_id, dedupe_key) do update
    set body = excluded.body,
        title = excluded.title,
        created_at = excluded.created_at,
        read_at = null,
        target_id = excluded.target_id;

  return v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. 읽음 처리 — 사용자별 마지막 읽은 메시지 위치를 갱신한다. 채팅 화면이 열려 있는 동안
--    주기적으로 호출되어(하트비트) "현재 보고 있음" 판정과 새 알림 해제에도 쓰인다.
--    멤버가 아니면(탈퇴/강퇴) NOT_A_MEMBER로 거부한다 — 클라이언트가 이걸로 구독을 끊는다.
-- ---------------------------------------------------------------------------
create or replace function public.mark_chat_read(
  p_chat_room_id uuid,
  p_last_read_message_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_party_id uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: 로그인이 필요합니다.';
  end if;

  select party_id into v_party_id from public.chat_rooms where id = p_chat_room_id;
  if v_party_id is null then
    raise exception 'CHAT_ROOM_NOT_FOUND: 채팅방을 찾을 수 없습니다.';
  end if;
  if not exists (
    select 1 from public.party_members
    where party_id = v_party_id and profile_id = auth.uid() and status = 'active'
  ) then
    raise exception 'NOT_A_MEMBER: 이 채팅방에 접근할 수 없습니다.';
  end if;

  insert into public.chat_read_states (chat_room_id, profile_id, last_read_message_id, last_read_at)
  values (p_chat_room_id, auth.uid(), p_last_read_message_id, now())
  on conflict (chat_room_id, profile_id) do update
    set last_read_at = now(),
        last_read_message_id = coalesce(excluded.last_read_message_id, public.chat_read_states.last_read_message_id);

  update public.notifications
    set read_at = now()
  where profile_id = auth.uid()
    and dedupe_key = 'chat_new_message:' || p_chat_room_id::text
    and read_at is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. 내 채팅방 목록 — party_members/chat_rooms/chat_messages의 기존 SELECT RLS를 그대로
--    타므로 SECURITY INVOKER(기본값)로 둔다. /chat 목록 화면이 이 하나로 필요한 모든 것을 얻는다.
-- ---------------------------------------------------------------------------
create or replace function public.list_my_chat_rooms()
returns table (
  chat_room_id uuid,
  party_id uuid,
  party_title text,
  activity_title text,
  last_message_body text,
  last_message_at timestamptz,
  last_message_sender_nickname text,
  unread_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    cr.id as chat_room_id,
    p.id as party_id,
    p.title as party_title,
    a.title as activity_title,
    lm.body as last_message_body,
    lm.created_at as last_message_at,
    sender.nickname as last_message_sender_nickname,
    coalesce((
      select count(*) from public.chat_messages cm2
      where cm2.chat_room_id = cr.id
        and cm2.sender_id is distinct from auth.uid()
        and cm2.created_at > coalesce(crs.last_read_at, 'epoch'::timestamptz)
    ), 0) as unread_count
  from public.party_members pm
  join public.chat_rooms cr on cr.party_id = pm.party_id
  join public.parties p on p.id = pm.party_id
  join public.activities a on a.id = p.activity_id
  left join public.chat_read_states crs on crs.chat_room_id = cr.id and crs.profile_id = auth.uid()
  left join lateral (
    select body, created_at, sender_id from public.chat_messages cm
    where cm.chat_room_id = cr.id
    order by cm.created_at desc
    limit 1
  ) lm on true
  left join public.profiles sender on sender.id = lm.sender_id
  where pm.profile_id = auth.uid() and pm.status = 'active'
  order by coalesce(lm.created_at, cr.created_at) desc;
$$;

grant execute on function public.list_my_chat_rooms() to authenticated;
revoke all on function public.list_my_chat_rooms() from public, anon;

-- ---------------------------------------------------------------------------
-- 7. 알림 읽음 처리 — notifications_update RLS를 운영자 전용으로 좁혔으므로 이 함수들을 거친다.
-- ---------------------------------------------------------------------------
create or replace function public.mark_notification_read(p_notification_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.notifications
    set read_at = now()
  where id = p_notification_id and profile_id = auth.uid() and read_at is null;
$$;

create or replace function public.mark_all_notifications_read()
returns void
language sql
security definer
set search_path = public
as $$
  update public.notifications
    set read_at = now()
  where profile_id = auth.uid() and read_at is null;
$$;

-- ---------------------------------------------------------------------------
-- 8. 기존 파티 함수에 시스템 메시지 삽입을 추가한다 (합류/탈퇴/팀장 위임/팀 확정).
--    나머지 로직은 20261003150000의 정의와 동일하다 — create or replace로 해당 부분만 보강한다.
-- ---------------------------------------------------------------------------

-- 8-1. 지원 승인 → 합류 시스템 메시지
create or replace function public.approve_application(p_application_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_peek record;
  v_app record;
  v_party record;
  v_slot record;
  v_active_count int;
  v_new_member_nickname text;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: 로그인이 필요합니다.';
  end if;

  select pa.profile_id, p.activity_id
    into v_peek
    from public.party_applications pa
    join public.parties p on p.id = pa.party_id
    where pa.id = p_application_id;
  if not found then
    raise exception 'APPLICATION_NOT_FOUND: 지원 내역을 찾을 수 없습니다.';
  end if;

  perform public.lock_activity_membership(v_peek.activity_id, v_peek.profile_id);

  select * into v_app from public.party_applications where id = p_application_id for update;
  if v_app.status = 'superseded' then
    raise exception 'APPLICATION_SUPERSEDED: 지원자가 같은 활동의 다른 파티에 먼저 승인되어 이 지원은 자동 종료되었습니다.';
  end if;
  if v_app.status <> 'pending' then
    raise exception 'APPLICATION_NOT_PENDING: 이미 처리된 지원입니다.';
  end if;

  select * into v_party from public.parties where id = v_app.party_id for update;
  if v_party.leader_id <> auth.uid() and not public.is_admin() then
    raise exception 'NOT_LEADER: 파티장만 지원을 승인할 수 있습니다.';
  end if;
  if v_party.status not in ('recruiting', 'full') then
    raise exception 'PARTY_NOT_RECRUITING: 모집 중인 파티가 아닙니다.';
  end if;

  if exists (
    select 1 from public.party_members
    where activity_id = v_party.activity_id and profile_id = v_app.profile_id and status = 'active'
  ) then
    raise exception 'ALREADY_ACTIVE_IN_ACTIVITY: 지원자가 이미 같은 활동의 다른 파티에서 활동 중입니다.';
  end if;

  select count(*) into v_active_count from public.party_members
    where party_id = v_party.id and status = 'active';
  if v_active_count >= v_party.capacity then
    raise exception 'PARTY_FULL: 파티 정원이 가득 찼습니다.';
  end if;

  if v_app.role_slot_id is not null then
    select * into v_slot from public.party_role_slots where id = v_app.role_slot_id for update;
    if not found then
      raise exception 'ROLE_SLOT_NOT_FOUND: 선택한 역할을 찾을 수 없습니다.';
    end if;
    if v_slot.filled_count >= v_slot.capacity then
      raise exception 'ROLE_SLOT_FULL: 역할(%)의 정원이 가득 찼습니다.', v_slot.role_name;
    end if;
  end if;

  insert into public.party_members (party_id, profile_id, is_leader, status, role_slot_id)
  values (v_party.id, v_app.profile_id, false, 'active', v_app.role_slot_id);

  update public.party_applications set status = 'approved', decided_at = now() where id = p_application_id;

  update public.party_applications
    set status = 'superseded', decided_at = now()
    where profile_id = v_app.profile_id
      and status = 'pending'
      and id <> p_application_id
      and party_id in (select id from public.parties where activity_id = v_party.activity_id);

  if v_active_count + 1 >= v_party.capacity then
    update public.parties set status = 'full' where id = v_party.id and status = 'recruiting';
  end if;

  select nickname into v_new_member_nickname from public.profiles where id = v_app.profile_id;
  perform public.insert_system_chat_message(
    v_party.id,
    coalesce(v_new_member_nickname, '멤버') || '님이 파티에 합류했어요.'
  );

  perform public.create_notification(
    v_app.profile_id, 'party_application_approved', 'party', v_party.id,
    '파티 지원이 승인되었어요', coalesce(v_party.title, '파티') || ' 지원이 승인되었습니다.',
    'party_application_approved:' || p_application_id::text
  );

  return v_party.id;
end;
$$;

-- 8-2. 탈퇴 → 탈퇴 시스템 메시지(혼자 남은 팀장의 탈퇴=해산 케이스 포함)
create or replace function public.leave_party(p_party_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_party record;
  v_member record;
  v_other_active_count int;
  v_leaving_nickname text;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: 로그인이 필요합니다.';
  end if;

  select * into v_party from public.parties where id = p_party_id for update;
  if not found then
    raise exception 'PARTY_NOT_FOUND: 파티를 찾을 수 없습니다.';
  end if;

  select * into v_member from public.party_members
    where party_id = p_party_id and profile_id = auth.uid() and status = 'active';
  if not found then
    raise exception 'NOT_A_MEMBER: 이 파티의 멤버가 아닙니다.';
  end if;

  select nickname into v_leaving_nickname from public.profiles where id = auth.uid();

  if v_member.is_leader then
    select count(*) into v_other_active_count from public.party_members
      where party_id = p_party_id and status = 'active' and profile_id <> auth.uid();
    if v_other_active_count > 0 then
      raise exception 'LEADER_MUST_DELEGATE: 다른 팀원이 있을 때는 팀장을 위임한 뒤 탈퇴할 수 있습니다.';
    end if;

    perform public.insert_system_chat_message(
      p_party_id, coalesce(v_leaving_nickname, '멤버') || '님이 파티를 탈퇴했어요.'
    );

    update public.party_members set status = 'left' where id = v_member.id;
    update public.party_applications set status = 'rejected', decided_at = now()
      where party_id = p_party_id and status = 'pending';
    update public.parties set status = 'cancelled' where id = p_party_id;
    return;
  end if;

  perform public.insert_system_chat_message(
    p_party_id, coalesce(v_leaving_nickname, '멤버') || '님이 파티를 탈퇴했어요.'
  );

  update public.party_members set status = 'left' where id = v_member.id;

  perform public.create_notification(
    v_party.leader_id, 'party_member_left', 'party', p_party_id,
    '팀원이 탈퇴했어요', '파티에서 팀원 한 명이 탈퇴했습니다.',
    'party_member_left:' || v_member.id::text
  );
end;
$$;

-- 8-3. 팀장 위임 → 위임 시스템 메시지
create or replace function public.delegate_leader(p_party_id uuid, p_new_leader_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_party record;
  v_new_leader_member record;
  v_new_leader_nickname text;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: 로그인이 필요합니다.';
  end if;

  select * into v_party from public.parties where id = p_party_id for update;
  if not found then
    raise exception 'PARTY_NOT_FOUND: 파티를 찾을 수 없습니다.';
  end if;
  if v_party.leader_id <> auth.uid() and not public.is_admin() then
    raise exception 'NOT_LEADER: 파티장만 위임할 수 있습니다.';
  end if;
  if v_party.status in ('cancelled', 'completed') then
    raise exception 'PARTY_INACTIVE: 종료된 파티입니다.';
  end if;
  if p_new_leader_profile_id = v_party.leader_id then
    raise exception 'ALREADY_LEADER: 이미 팀장입니다.';
  end if;

  select * into v_new_leader_member from public.party_members
    where party_id = p_party_id and profile_id = p_new_leader_profile_id and status = 'active';
  if not found then
    raise exception 'NOT_A_MEMBER: 새 팀장은 이 파티의 활성 멤버여야 합니다.';
  end if;

  update public.party_members set is_leader = false
    where party_id = p_party_id and profile_id = v_party.leader_id;
  update public.party_members set is_leader = true where id = v_new_leader_member.id;
  update public.parties set leader_id = p_new_leader_profile_id where id = p_party_id;

  select nickname into v_new_leader_nickname from public.profiles where id = p_new_leader_profile_id;
  perform public.insert_system_chat_message(
    p_party_id, coalesce(v_new_leader_nickname, '멤버') || '님에게 팀장이 위임되었어요.'
  );

  perform public.create_notification(
    p_new_leader_profile_id, 'party_leader_delegated', 'party', p_party_id,
    '팀장이 되었어요', '파티장 권한을 위임받았습니다.',
    'party_leader_delegated:' || p_party_id::text || ':' || p_new_leader_profile_id::text
  );
end;
$$;

-- 8-4. 팀 확정 → 확정 시스템 메시지
create or replace function public.confirm_party(p_party_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_party record;
  v_member record;
  v_active_count int;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: 로그인이 필요합니다.';
  end if;

  select * into v_party from public.parties where id = p_party_id for update;
  if not found then
    raise exception 'PARTY_NOT_FOUND: 파티를 찾을 수 없습니다.';
  end if;
  if v_party.leader_id <> auth.uid() and not public.is_admin() then
    raise exception 'NOT_LEADER: 파티장만 확정할 수 있습니다.';
  end if;
  if v_party.status not in ('recruiting', 'full') then
    raise exception 'PARTY_NOT_CONFIRMABLE: 모집 중이거나 정원이 찬 파티만 확정할 수 있습니다.';
  end if;

  select count(*) into v_active_count from public.party_members where party_id = p_party_id and status = 'active';
  if v_active_count = 0 then
    raise exception 'PARTY_CONFIRM_NO_MEMBERS: 활성 멤버가 없어 확정할 수 없습니다.';
  end if;

  update public.party_members set is_confirmed = true where party_id = p_party_id and status = 'active';

  update public.party_applications
    set status = 'rejected', decided_at = now()
    where party_id = p_party_id and status = 'pending';

  update public.parties set status = 'confirmed' where id = p_party_id;

  perform public.insert_system_chat_message(p_party_id, '팀이 확정되었어요. 이제 팀 채팅으로 소통해 보세요.');

  for v_member in select * from public.party_members where party_id = p_party_id and status = 'active'
  loop
    perform public.create_notification(
      v_member.profile_id, 'party_confirmed', 'party', p_party_id,
      '파티가 확정되었어요', coalesce(v_party.title, '파티') || ' 팀이 확정되었습니다.',
      'party_confirmed:' || v_member.id::text
    );
  end loop;
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
    'send_chat_message(uuid, text, text)',
    'mark_chat_read(uuid, uuid)',
    'mark_notification_read(uuid)',
    'mark_all_notifications_read()',
    'approve_application(uuid)',
    'leave_party(uuid)',
    'delegate_leader(uuid, uuid)',
    'confirm_party(uuid)'
  ]
  loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end;
$$;
