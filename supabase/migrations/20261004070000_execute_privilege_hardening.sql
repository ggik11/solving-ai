-- 5-B 보안 리뷰 후속 조치: `revoke all on function ... from public` 패턴이 anon/authenticated
-- 접근을 막지 못한다는 사실(20261004060000)을 전체 public 스키마로 확대 점검한 결과, 지금까지
-- "막혀 있다"고 가정했던 함수 다수가 실제로는 anon/authenticated에게 그대로 노출돼 있었다.
-- `pg_proc`/`information_schema.routine_privileges`를 직접 조회해 재현 확인했다
-- (`tests/rls/execute_privileges.test.ts`가 이제 이 상태를 전수 가드한다).
--
-- 가장 심각한 건 **`run_match_worker(timestamptz)`**다 — pg_cron(service_role)만 호출하도록
-- 의도했지만 `revoke all ... from public`으로는 이름이 명시된 anon/authenticated grant를 전혀
-- 건드리지 못해, **로그인한 사용자는 물론 비로그인(anon) 사용자도 임의의 기준 시각으로 매칭
-- 워커 전체 실행을 직접 트리거할 수 있었다**(재현: `POST /rest/v1/rpc/run_match_worker
-- {"p_as_of": "<임의 timestamptz>"}`를 anon 키로 호출 — 42501 없이 정상 실행됨). 기준 시각을
-- 조작해 만료 처리/매칭 편성 타이밍을 앞당기거나, 분당 1회로 제한된 pg_cron 스케줄을 무시하고
-- 원하는 만큼 반복 호출해 부하를 유발할 수 있는 경로였다.
--
-- 나머지(트리거 함수 전부 + `create_notification`/`insert_system_chat_message`/
-- `lock_activity_membership`)는 전부 다른 SECURITY DEFINER 함수 안에서만 호출되거나
-- (호출 시점의 역할이 함수 소유자(postgres)로 바뀌므로 grant 불필요) 트리거로만 실행되는
-- 함수라(트리거 발동은 EXECUTE grant 없이도 일어나고, `trigger` 반환형은 PostgREST가 RPC로
-- 노출하지도 않는다) 실질적 피해는 없었다 — 그래도 최소 권한 원칙과 아래 가드 테스트 통과를
-- 위해 명시적으로 anon/authenticated에서 제거한다.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'run_match_worker(timestamptz)',
    'create_notification(uuid, text, text, uuid, text, text, text)',
    'insert_system_chat_message(uuid, text)',
    'lock_activity_membership(uuid, uuid)',
    'set_updated_at()',
    'handle_new_user()',
    'party_members_before_insert()',
    'party_members_sync_slot_count()',
    'parties_sync_confirmed_members()',
    'parties_create_chat_room()',
    'chat_messages_broadcast()'
  ]
  loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', fn);
  end loop;
end;
$$;

-- `run_match_worker`는 service_role에게만 열려 있어야 한다(위 do 블록이 anon/authenticated만
-- 지웠으므로 기존 service_role grant는 그대로 유지된다 — 재확인용으로 명시적으로 다시 건다).
grant execute on function public.run_match_worker(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- "허용 목록"에 있는 함수(파티·채팅·매칭·신고·관리자·탈퇴 등 로그인 사용자용 RPC) 중 이 앱에서
-- anon(비로그인)이 호출할 일이 전혀 없는 것들도 같은 leak으로 지금까지 anon에게 EXECUTE가 열려
-- 있었다. 전부 본문 맨 앞에서 `auth.uid() is null`을 확인해 거부하므로 정보가 새지는 않았지만
-- (호출 자체는 되지만 즉시 NOT_AUTHENTICATED), 최소 권한 원칙에 따라 anon에서 제거하고
-- authenticated에게만 남긴다. `is_match_proposal_member(uuid)`도 같은 이유로 포함한다 —
-- match_proposal_members는 로그인 사용자만 쓰는 테이블이라 anon이 조회할 일이 없다(원래
-- 작성 의도도 "authenticated에게만"이었고, 생성 시점 leak으로 anon도 받아간 것이었다).
-- `is_admin()`/`is_party_member(uuid)`는 제외한다 — 이 둘은 anon도 조회 가능한 테이블
-- (activities/profiles/party_members/chat_* 등, 테이블 자체는 anon도 기본 권한을 갖고 RLS로
-- 걸러진다)의 RLS 정책 USING절에서 직접 호출되므로, anon의 EXECUTE가 없으면 그 테이블을
-- 조회하는 것 자체가 "permission denied for function"으로 깨진다(`tests/rls/anon.test.ts`로
-- 재확인: 비로그인 사용자의 조회는 에러 없이 빈 배열을 받아야 한다).
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'apply_to_party(uuid, uuid, text)',
    'is_match_proposal_member(uuid)',
    'approve_activity_submission(uuid)',
    'approve_application(uuid)',
    'cancel_application(uuid)',
    'cancel_matching_queue(uuid)',
    'confirm_party(uuid)',
    'create_party(uuid, text, text, text, timestamptz, jsonb, text)',
    'create_report(text, uuid, text, text)',
    'delegate_leader(uuid, uuid)',
    'disband_party(uuid)',
    'get_reported_message_context(uuid, int)',
    'join_matching_queue(uuid, uuid, text[], boolean, boolean)',
    'leave_party(uuid)',
    'mark_all_notifications_read()',
    'mark_chat_read(uuid, uuid)',
    'mark_notification_read(uuid)',
    'reject_activity_submission(uuid, text)',
    'reject_application(uuid)',
    'reopen_party(uuid)',
    'respond_to_match_proposal(uuid, boolean)',
    'send_chat_message(uuid, text, text)',
    'submit_activity(text, text, text, text, text, text, text, text)',
    'suspend_account(uuid, text)',
    'unsuspend_account(uuid)',
    'update_party_details(uuid, text, text, text, timestamptz, jsonb, jsonb)',
    'update_report_status(uuid, text, text)',
    'withdraw_account()'
  ]
  loop
    execute format('revoke execute on function public.%s from anon', fn);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 재발 방지: public 스키마에 새로 만드는 함수는 이제부터 anon/authenticated에게 EXECUTE가
-- 자동으로 부여되지 않는다. Supabase 로컬/클라우드 스택이 기본으로 걸어 둔
-- `ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role`
-- (역할 postgres 기준 — 마이그레이션은 이 역할로 연결해 함수를 만든다)을 뒤집는다. service_role
-- 자동 부여는 그대로 둔다(서버 전용 역할이라 RLS처럼 재검증을 거치지 않아도 안전하고,
-- run_match_worker 같은 워커 함수가 이 기본값에 의존하기 때문).
-- (`pg_default_acl`에는 `supabase_admin`이 설정한 같은 모양의 기본값도 있지만, 그건 Supabase
-- 플랫폼 자체의 부트스트랩 스키마용이고 우리 마이그레이션은 전부 `postgres`로 연결해 실행되므로
-- 이 역할의 기본값만 바꾸면 된다 — `postgres`는 `supabase_admin`의 기본값을 바꿀 권한이 없다
-- (42501), 실제로 시도해 확인함.)
--
-- 이후 모든 새 마이그레이션은 "일반 사용자가 호출해야 하는 함수"만 아래 패턴으로 명시적으로
-- authenticated(필요하면 anon도)에게 grant 해야 한다 — 그 외에는 아무것도 하지 않아도 이제
-- anon/authenticated에게 닫혀 있다:
--
--   revoke execute on function public.새함수(...) from public, anon, authenticated;
--   grant execute on function public.새함수(...) to authenticated; -- anon도 호출해야 하면 추가
--
-- 이 규칙은 docs/architecture.md 13장과 README.md "데이터베이스 함수 권한 규칙"에도 적어 둔다.
-- `tests/rls/execute_privileges.test.ts`가 "허용 목록에 없는 함수가 anon/authenticated에게
-- EXECUTE를 갖고 있으면" 테스트를 실패시켜, 허용 목록을 갱신하지 않고는 이 규칙을 깨뜨릴 수
-- 없게 한다.
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;
