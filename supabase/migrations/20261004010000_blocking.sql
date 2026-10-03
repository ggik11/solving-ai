-- 5-A단계(차단): blocks 테이블/RLS는 2단계(기반)에서 이미 만들어져 있었지만 화면·연동 로직이
-- 없었다. 이번 작업은 "차단하면 새 파티 추천·자동 매칭·신규 초대에서 서로 제외된다"를 실제로
-- 연결한다.
--
-- - 자동 매칭(_find_match_for_group)은 4-B에서 이미 public._blocked()로 차단 관계를 제외한다 —
--   추가 작업 불필요(아래 두 함수만 새로 연결).
-- - "새 파티 추천"(활동 상세의 "관련 파티" 목록)은 앱 레이어에서 필터링한다(쿼리 결과를
--   src/lib/blocks.ts의 순수 함수로 걸러냄) — DB 변경 불필요.
-- - "신규 초대"에 해당하는 수동 파티 지원(apply_to_party)은 여기서 막는다: 지원자가 그 파티의
--   활성 멤버(팀장 포함) 중 누구와도 차단 관계면 지원 자체를 거부한다.
-- - "알림 억제": send_chat_message가 방 단위로 새 메시지 알림을 만들 때, 수신자가 발신자를
--   차단했으면(또는 그 반대) 그 수신자에게는 알림을 만들지 않는다. 메시지 자체는 여전히
--   저장·전달되고(이미 같은 팀이면 강퇴하지 않음), 화면에서 숨기는 것은 클라이언트가 처리한다
--   (ChatRoomClient가 차단한 발신자의 메시지를 필터링).

-- ---------------------------------------------------------------------------
-- apply_to_party: 차단 관계가 있는 활성 멤버가 있으면 지원을 거부한다.
-- 나머지 로직은 20261003150000의 정의와 동일하다.
-- ---------------------------------------------------------------------------
create or replace function public.apply_to_party(p_party_id uuid, p_role_slot_id uuid, p_message text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_party record;
  v_slot record;
  v_applied_this_hour int;
  v_limit_per_hour int;
  v_application_id uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: 로그인이 필요합니다.';
  end if;

  select * into v_party from public.parties where id = p_party_id;
  if not found then
    raise exception 'PARTY_NOT_FOUND: 파티를 찾을 수 없습니다.';
  end if;
  if v_party.status <> 'recruiting' then
    raise exception 'PARTY_NOT_RECRUITING: 모집 중인 파티가 아닙니다.';
  end if;
  if v_party.leader_id = auth.uid() then
    raise exception 'ALREADY_LEADER: 이미 이 파티의 팀장입니다.';
  end if;

  if p_role_slot_id is null then
    raise exception 'ROLE_SLOT_REQUIRED: 지원할 역할을 선택해야 합니다.';
  end if;
  select * into v_slot from public.party_role_slots where id = p_role_slot_id and party_id = p_party_id;
  if not found then
    raise exception 'ROLE_SLOT_NOT_FOUND: 선택한 역할을 찾을 수 없습니다.';
  end if;
  if v_slot.filled_count >= v_slot.capacity then
    raise exception 'ROLE_SLOT_FULL: 선택한 역할(%)은 이미 정원이 찼습니다.', v_slot.role_name;
  end if;

  if exists (
    select 1 from public.party_members
    where party_id = p_party_id and profile_id = auth.uid() and status = 'active'
  ) then
    raise exception 'ALREADY_MEMBER: 이미 이 파티의 멤버입니다.';
  end if;
  if exists (
    select 1 from public.party_members
    where activity_id = v_party.activity_id and profile_id = auth.uid() and status = 'active'
  ) then
    raise exception 'ALREADY_ACTIVE_IN_ACTIVITY: 이미 이 활동의 다른 파티에서 활동 중입니다.';
  end if;
  if exists (
    select 1 from public.party_applications
    where party_id = p_party_id and profile_id = auth.uid() and status = 'pending'
  ) then
    raise exception 'ALREADY_APPLIED: 이미 대기 중인 지원이 있습니다.';
  end if;
  if exists (
    select 1 from public.party_members pm
    where pm.party_id = p_party_id and pm.status = 'active' and public._blocked(auth.uid(), pm.profile_id)
  ) then
    raise exception 'BLOCKED_MEMBER: 차단 관계가 있는 멤버가 있어 이 파티에 지원할 수 없습니다.';
  end if;

  select coalesce((value ->> 'apply_per_hour')::int, 10) into v_limit_per_hour
    from public.app_settings where key = 'party_rate_limits';
  v_limit_per_hour := coalesce(v_limit_per_hour, 10);

  select count(*) into v_applied_this_hour from public.party_applications
    where profile_id = auth.uid() and created_at > now() - interval '1 hour';
  if v_applied_this_hour >= v_limit_per_hour then
    raise exception 'RATE_LIMITED: 시간당 지원 가능 횟수(%)를 초과했습니다.', v_limit_per_hour;
  end if;

  insert into public.party_applications (party_id, profile_id, role_slot_id, message, status)
  values (p_party_id, auth.uid(), p_role_slot_id, nullif(trim(p_message), ''), 'pending')
  returning id into v_application_id;

  perform public.create_notification(
    v_party.leader_id, 'party_application_received', 'party', p_party_id,
    '새 지원이 도착했어요',
    coalesce(v_party.title, '파티') || '에 ' || v_slot.role_name || ' 역할로 새 지원이 도착했습니다.',
    'party_application_received:' || v_application_id::text
  );

  return v_application_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- send_chat_message: 방 단위 알림을 만들 때 "발신자를 차단한 수신자"는 제외한다.
-- 나머지 로직은 20261003160000의 정의와 동일하다.
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
    -- 알림 억제: 발신자를 차단한 수신자에게는 "새 메시지" 알림을 만들지 않는다(요청: 차단 시
    -- 메시지는 숨기고 알림은 억제하되, 이미 같은 팀이면 강퇴·메시지 삭제는 하지 않음).
    and not public._blocked(pm.profile_id, auth.uid())
  on conflict (profile_id, dedupe_key) do update
    set body = excluded.body,
        title = excluded.title,
        created_at = excluded.created_at,
        read_at = null,
        target_id = excluded.target_id;

  return v_new_id;
end;
$$;
