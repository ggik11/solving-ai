-- 링크 붙여넣기 활동 등록(4/N: 정기 점검) — 공개 중인 활동의 원문 링크를 하루 1회 점검한다.
--
-- 설계 메모:
-- - 매칭 워커(run_match_worker)와 달리 이 점검은 **외부 호스트로 나가는 실제 HTTP 요청**이
--   필요하다. Postgres(pg_cron)는 그 자체로 외부 HTTP 요청을 할 수 없으므로(pg_net 같은 확장
--   없이는), 실제 가져오기는 Next.js Route Handler(`src/app/api/cron/link-check/route.ts`,
--   SSRF 방어를 포함한 같은 `fetchSinglePage`를 재사용)에서 수행하고, DB는 "어떤 활동을
--   점검할지 안전하게 나눠주고(claim)" "결과를 기록하는" 두 함수만 담당한다.
-- - 중복 실행 안전성: claim_activities_for_link_check()는 `FOR UPDATE SKIP LOCKED`로 후보를
--   잠그고 **같은 트랜잭션 안에서 즉시 last_verification_attempt_at을 찍어 반환**한다 —
--   워커가 겹쳐 실행되거나 재시도돼도 같은 활동을 두 번 점검하지 않는다(matching 워커의
--   SKIP LOCKED 패턴과 동일한 원칙).
-- - "하루 1회": claim은 last_verification_attempt_at이 없거나 p_stale_after_hours(기본 20시간)
--   보다 오래된 활동만 후보로 삼는다. 외부 스케줄러(Vercel Cron 등)가 하루에 여러 번 또는
--   살짝 어긋난 시각에 그 엔드포인트를 호출해도 이 창 때문에 실제로는 하루에 한 번만 점검된다.

alter table public.activities
  add column last_verification_attempt_at timestamptz;

comment on column public.activities.last_verification_attempt_at is
  '정기 점검 워커가 이 활동을 마지막으로 "시도"한 시각(성공/실패 무관). 중복 실행 방지·점검
   주기 판단에 쓴다. 점검이 성공했을 때만 갱신되는 last_verified_at과는 다른 용도다.';

create or replace function public.claim_activities_for_link_check(
  p_limit int,
  p_as_of timestamptz default now(),
  p_stale_after_hours int default 20
) returns setof public.activities
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    with candidates as (
      select id from public.activities
      where status = 'published'
        and source_url is not null
        and (
          last_verification_attempt_at is null
          or last_verification_attempt_at <= p_as_of - (p_stale_after_hours || ' hours')::interval
        )
      order by last_verification_attempt_at nulls first, id
      limit p_limit
      for update skip locked
    )
    update public.activities a
      set last_verification_attempt_at = p_as_of
      from candidates c
      where a.id = c.id
      returning a.*;
end;
$$;

comment on function public.claim_activities_for_link_check(int, timestamptz, int) is
  '점검할 활동을 안전하게 나눠주는(claim) 함수. service_role 전용(실제 HTTP 요청은 호출자가
   Node에서 수행). 여러 워커가 동시에 호출해도 같은 활동을 중복으로 가져가지 않는다.';

create or replace function public.record_link_check_result(
  p_activity_id uuid,
  p_ok boolean,
  p_resolved_url text default null,
  p_note text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_was_failing boolean;
begin
  select needs_verification into v_was_failing from public.activities where id = p_activity_id;
  if v_was_failing is null then
    raise exception 'ACTIVITY_NOT_FOUND: 활동을 찾을 수 없습니다.';
  end if;

  if p_ok then
    update public.activities
      set needs_verification = false,
          verification_note = null,
          last_verified_at = now(),
          source_url_resolved = coalesce(p_resolved_url, source_url_resolved)
      where id = p_activity_id;
  else
    update public.activities
      set needs_verification = true,
          verification_note = p_note
      where id = p_activity_id;

    -- 운영자에게 알림을 보낸다. dedupe_key를 활동 단위로 고정해 두어, 같은 문제가 계속
    -- 이어지는 동안(매일 점검이 실패할 때마다) 알림이 쌓이지 않고 1건으로 묶인다 — 한 번
    -- 읽으면 다음 실패 때 다시 "안 읽음"으로 되살아난다(채팅 새 메시지 알림과 같은 패턴).
    insert into public.notifications (profile_id, type, target_type, target_id, title, body, dedupe_key)
    select
      ur.profile_id, 'activity_link_check_failed', 'activity', p_activity_id,
      '활동 원문 링크 확인이 필요해요',
      coalesce(p_note, '원문 링크 점검에 실패했습니다.'),
      'link_check_failed:' || p_activity_id::text
    from public.user_roles ur
    where ur.role = 'admin'
    on conflict (profile_id, dedupe_key) do update
      set body = excluded.body, read_at = null, created_at = now();
  end if;
end;
$$;

comment on function public.record_link_check_result(uuid, boolean, text, text) is
  '점검 결과를 기록한다. 정상이면 last_verified_at 갱신 + needs_verification 해제, 비정상이면
   needs_verification=true + verification_note 기록 + 운영자 알림(활동 단위로 중복 억제).
   service_role 전용.';

do $$
begin
  execute 'revoke all on function public.claim_activities_for_link_check(int, timestamptz, int) from public';
  execute 'grant execute on function public.claim_activities_for_link_check(int, timestamptz, int) to service_role';
  execute 'revoke all on function public.record_link_check_result(uuid, boolean, text, text) from public';
  execute 'grant execute on function public.record_link_check_result(uuid, boolean, text, text) to service_role';
end;
$$;
