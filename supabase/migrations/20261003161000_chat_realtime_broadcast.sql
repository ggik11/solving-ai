-- 4-A단계 보완: 팀 채팅 Realtime 전달 방식을 postgres_changes에서 Broadcast-from-Database로 바꾼다.
--
-- 왜 바꾸는가(로컬 스택에서 수동 검증으로 발견): Supabase Realtime의 `{ config: { private: true } }`
-- 채널 옵션은 Broadcast/Presence에만 적용되고 Postgres Changes에는 적용되지 않는다 — 공식 문서:
-- "The private Channel option does not apply to Postgres Changes." private 채널은
-- realtime.messages에 대한 RLS로 "채널 구독(조인) 자체"를 인가하는데, 이 테이블에 정책이 하나도
-- 없으면(기본값, 이 프로젝트의 로컬 스택도 그랬다) 누구도 private 채널에 조인하지 못한다. 20261003160000
-- 설계 메모가 기대했던 "postgres_changes + private:true"는 구독이 아예 성립하지 않아 어떤 이벤트도
-- 전달되지 않았다(two-browser-context E2E로 재현·확인).
--
-- 대신 Supabase가 공식적으로 권장하는 "Broadcast from Database"를 쓴다:
--   1. chat_messages AFTER INSERT 트리거가 realtime.broadcast_changes()로 새 행을
--      'chat_room:<chat_room_id>' 토픽에 'new_message' 이벤트로 브로드캐스트한다.
--   2. realtime.messages에 RLS 정책을 걸어, 그 토픽이 가리키는 채팅방의 활성 멤버만 수신(SELECT)할
--      수 있게 한다 — is_party_member() 헬퍼를 그대로 재사용한다.
--   3. 클라이언트는 `{ config: { private: true } }` 채널로 'broadcast' 이벤트를 구독한다(다음
--      커밋에서 구현). 탈퇴/강퇴된 사용자는 is_party_member가 더 이상 참이 아니므로 이 RLS가 막아
--      이후 브로드캐스트를 받지 못한다 — "화면에서 버튼을 숨기는 것"이 아니라 DB 정책 수준의 통제다.

create or replace function public.chat_messages_broadcast()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform realtime.broadcast_changes(
    'chat_room:' || new.chat_room_id::text,
    'new_message',
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  return new;
end;
$$;

create trigger chat_messages_broadcast_trg
after insert on public.chat_messages
for each row execute function public.chat_messages_broadcast();

create policy "chat_room_active_members_can_receive" on realtime.messages
for select
to authenticated
using (
  exists (
    select 1 from public.chat_rooms cr
    where realtime.topic() = 'chat_room:' || cr.id::text
      and public.is_party_member(cr.party_id)
  )
);
