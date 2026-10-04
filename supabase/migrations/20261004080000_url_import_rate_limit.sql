-- 링크 붙여넣기 활동 등록(1/N: 가져오기·SSRF) — URL 가져오기 요청 빈도 제한.
-- 실제 외부 페이지 가져오기(DNS 조회·HTTP 요청·SSRF 검사)는 src/lib/activity-import/fetch.ts가
-- Node 서버 액션 안에서 수행한다(Postgres는 임의 외부 호스트로 나가는 HTTP 요청을 할 수 없다).
-- 그래서 빈도 제한만 DB에 둔다 — 기존 파티/채팅 빈도 제한과 같은 패턴(카운트 후 거부, 통과 시
-- 로그 적재)이며, 서버 액션은 실제 가져오기를 시작하기 *전에* 이 함수를 호출해 제한을 넘으면
-- 외부 요청 자체를 아예 하지 않는다.

create table public.url_fetch_log (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.url_fetch_log is
  '활동 URL 가져오기 요청 빈도 제한용 로그. 일반 사용자는 직접 읽거나 쓸 수 없고(RLS 정책 없음),
   check_url_fetch_rate_limit()(SECURITY DEFINER)만 접근한다.';

create index url_fetch_log_profile_id_created_at_idx on public.url_fetch_log (profile_id, created_at);

alter table public.url_fetch_log enable row level security;
-- 의도적으로 정책을 하나도 만들지 않는다 — RLS가 켜진 상태에서 정책이 없으면 소유자가 아닌
-- 모든 역할(anon/authenticated 포함)의 직접 접근이 전부 거부된다. SECURITY DEFINER 함수만
-- (함수 소유자 권한으로 실행되어 RLS를 우회하므로) 이 테이블에 쓸 수 있다.

insert into public.app_settings (key, value, description) values
  ('url_import_rate_limits', '{"fetches_per_hour": 20}'::jsonb,
   'URL로 활동 가져오기(미리보기 생성) 요청 빈도 제한. 사용자별 시간당 허용 횟수.')
on conflict (key) do nothing;

create or replace function public.check_url_fetch_rate_limit()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit_per_hour int;
  v_fetched_this_hour int;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: 로그인이 필요합니다.';
  end if;
  perform public._require_active_profile(auth.uid());

  select coalesce((value ->> 'fetches_per_hour')::int, 20) into v_limit_per_hour
    from public.app_settings where key = 'url_import_rate_limits';
  v_limit_per_hour := coalesce(v_limit_per_hour, 20);

  select count(*) into v_fetched_this_hour from public.url_fetch_log
    where profile_id = auth.uid() and created_at > now() - interval '1 hour';
  if v_fetched_this_hour >= v_limit_per_hour then
    raise exception 'RATE_LIMITED: 시간당 URL 가져오기 가능 횟수(%)를 초과했습니다.', v_limit_per_hour;
  end if;

  insert into public.url_fetch_log (profile_id) values (auth.uid());
end;
$$;

revoke all on function public.check_url_fetch_rate_limit() from public, anon, authenticated;
grant execute on function public.check_url_fetch_rate_limit() to authenticated;
