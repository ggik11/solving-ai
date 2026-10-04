-- 보안 수정(독립 보안 리뷰에서 발견, Medium — 실제로 anon 키로 재현 확인): is_admin_profile(uuid)이
-- 다른 민감한 SECURITY DEFINER 함수들과 달리 EXECUTE 권한 정리 블록에서 빠져 있었다.
--
-- 더 중요한 사실(수정하며 직접 확인함): 이 저장소 전체가 지금까지 써 온
-- `revoke all on function ... from public` 패턴은 애초에 anon/authenticated의 접근을 막지
-- 못하고 있었다 — `pg_default_acl`을 직접 조회해 보면 Supabase 로컬 스택이
-- `ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role`
-- 로 "public 스키마의 새 함수는 생성 즉시 anon/authenticated에도 EXECUTE가 자동으로 부여된다"를
-- 설정해 두고 있다. `PUBLIC`(모두)에서 revoke해도 `anon`/`authenticated`라는 **이름이 명시된
-- 역할**에 대한 별도 grant는 전혀 건드리지 못한다(실제로 다른 "잠긴" 함수들도 anon이 여전히
-- EXECUTE를 갖고 있음을 `information_schema.routine_privileges`로 재현 확인했다).
--
-- 다행히 **실질적 피해는 이 함수 하나로 국한된다**: 다른 모든 SECURITY DEFINER 함수는 본문
-- 맨 앞에서 `auth.uid() is null`을 확인해 비로그인 호출을 거부하므로(anon이 함수를 "호출은"
-- 할 수 있어도 즉시 NOT_AUTHENTICATED로 막힌다), EXECUTE grant 자체가 열려 있어도 정보가 새지
-- 않는다. 반면 is_admin_profile()은 호출자가 누구인지 전혀 보지 않고 **임의의 p_profile_id**가
-- 운영자인지만 반환하므로, 호출 자체가 막히지 않으면 그대로 정보가 샌다 — 그래서 이 함수만
-- 실제로 악용 가능했다(로컬에서 anon 키로 `POST /rest/v1/rpc/is_admin_profile
-- {"p_profile_id": "<임의 uuid>"}`를 호출해 true/false를 직접 받는 것으로 재현).
-- profile_id는 party_members/match_proposal_members/채팅 발신자 등으로 같은 팀 멤버에게 이미
-- 노출되는 값이라, 이걸로 "누가 운영자인지"를 조용히 알아내 표적 삼을 수 있었다 — 닉네임 뒤에
-- 실제 신원·역할을 숨긴다는 설계 원칙(지시서 3장)을 이 함수 하나가 깨고 있었다.
--
-- 수정: PUBLIC이 아니라 실제로 접근 중인 역할(anon, authenticated)에서 명시적으로 revoke한다.
-- 이 함수는 suspend_account() 내부에서만 쓰이고(같은 함수 소유자 권한으로 호출되므로 호출자에게
-- 별도 grant가 필요 없다) 외부에 공개할 이유가 없다.
revoke execute on function public.is_admin_profile(uuid) from public, anon, authenticated;

-- 같은 원인으로 내부 전용(`_` 접두사) 헬퍼 함수 10개도 전부 anon/authenticated가 직접 호출할 수
-- 있는 상태였다(위와 같은 이유로 재현 확인). 이 중 다수는 단순 조회가 아니라 **쓰기/상태 전이**
-- 함수라 훨씬 더 심각하다 — 특히 `_finalize_match_proposal(proposal_id)`는 "모든 멤버가
-- 수락했는지"를 스스로 재검사하지 않는다(그 검사는 정상 경로인 respond_to_match_proposal이
-- 호출 전에 이미 했다고 가정한다 — 멱등 가드(`status<>'proposed' or party_id is not null`)만
-- 있다). 즉 로그인한 사용자 누구나 아직 전원 수락하지 않은 proposal_id로
-- `public._finalize_match_proposal(id)`를 직접 호출하면, 일부만 수락한 상태에서도 파티·채팅방이
-- 만들어질 수 있었다 — "전원 수락해야 확정 팀이 생긴다"(지시서 7장 B 항목 8)는 핵심 불변식을
-- 정상 화면을 거치지 않고 깰 수 있는 경로였다. 나머지 내부 함수들도 같은 원칙으로 막는다 —
-- 전부 다른 SECURITY DEFINER 함수 안에서만 호출되므로(그 함수의 소유자 권한으로 호출되어
-- grant와 무관하게 동작) 외부 grant가 전혀 필요 없다.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    '_blocked(uuid, uuid)',
    '_cancel_matching_queue_for_activity(uuid, uuid)',
    '_enforce_active_account()',
    '_finalize_match_proposal(uuid)',
    '_find_match_for_group(uuid, uuid, timestamptz)',
    '_log_audit_action(text, text, uuid, jsonb)',
    '_multirange_minutes(int4multirange)',
    '_profile_weekly_multirange(uuid)',
    '_release_match_proposal(uuid, text)',
    '_require_active_profile(uuid)'
  ]
  loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', fn);
  end loop;
end;
$$;
