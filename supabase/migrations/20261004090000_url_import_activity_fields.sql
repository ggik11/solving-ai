-- 링크 붙여넣기 활동 등록(3/N: 화면) — URL 가져오기로 등록한 활동의 출처 추적 컬럼과,
-- 사용자 제보(submit_activity)도 날짜·가져오기 메타데이터를 받을 수 있도록 시그니처를 늘린다.
--
-- 설계 메모:
-- - source_url_resolved: 가져오기 시점에 리다이렉트를 다 따라간 "최종 URL"(검토용 — 운영자가
--   입력한 source_url과 다를 수 있다. 예: 단축 URL -> 실제 공고 페이지).
-- - apply_end_at_evidence: 접수 마감일을 추출기가 찾았을 때 "원문에 그대로 있던 문자열"을
--   저장한다. 정기 점검 워커(4/4)가 다시 그 문자열이 페이지에 남아있는지 확인하는 데 쓴다.
--   운영자가 날짜를 직접 입력(후보를 고르지 않음)하면 이 값은 비워두고, 그 활동은 정기 점검에서
--   "HTTP 응답만" 확인한다(원문 전문을 저장하지 않으므로 그 이상은 재확인할 수 없다).
-- - needs_verification/verification_note: 가져오기 시점이 아니라 **정기 점검 워커(4/4)**가
--   관리하는 운영 플래그다. 가져오기 미리보기의 "검증됨/원문 확인 필요" 표시는 화면에만
--   나타나고 저장하지 않는다(날짜 자체는 항상 추출 시점의 원문 대조를 통과한 값만 후보로 쓰므로
--   DB에 저장할 시점엔 이미 "검증된 후보"이거나 운영자가 수동으로 입력한 값이다). 이 두 컬럼은
--   등록 시 항상 기본값(false/null)으로 시작하고, 정기 점검에서만 바뀐다.
alter table public.activities
  add column source_url_resolved text,
  add column apply_end_at_evidence text,
  add column needs_verification boolean not null default false,
  add column verification_note text;

comment on column public.activities.source_url_resolved is
  'URL 가져오기 시점에 리다이렉트를 따라간 최종 URL(검토용).';
comment on column public.activities.apply_end_at_evidence is
  '접수 마감일을 추출기가 원문에서 찾았을 때 그 원문 문자열. 정기 점검 워커가 재확인에 쓴다.';
comment on column public.activities.needs_verification is
  '정기 점검 워커가 "원문 확인 필요" 상태로 표시했는지. 모집 상태 계산과는 무관(표시용 플래그).';

-- submit_activity: 사용자 제보도 날짜·가져오기 메타데이터를 받을 수 있도록 끝에 선택
-- 파라미터를 추가한다. 주의: PostgreSQL에서 함수의 "신원(identity)"은 이름+파라미터 타입
-- 목록 전체라서, 파라미터 개수가 달라지면 `create or replace`가 기존 함수를 대체하는 게
-- 아니라 **오버로드로 새로 추가**해 버린다(옛 8-인자 버전이 anon/authenticated 권한을 그대로
-- 쥔 채 남아있게 됨 — execute_privileges.test.ts가 실제로 이렇게 잡아냈다). 그래서 옛 시그니처를
-- 먼저 명시적으로 지운다.
drop function if exists public.submit_activity(text, text, text, text, text, text, text, text);

create or replace function public.submit_activity(
  p_title text,
  p_summary text,
  p_description text,
  p_org_name text,
  p_source_url text,
  p_location_type text,
  p_region text,
  p_participation_mode text,
  p_apply_start_at timestamptz default null,
  p_apply_end_at timestamptz default null,
  p_activity_start_at timestamptz default null,
  p_activity_end_at timestamptz default null,
  p_source_url_resolved text default null,
  p_apply_end_at_evidence text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit_per_day int;
  v_submitted_today int;
  v_activity_id uuid;
  v_source_url text;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: 로그인이 필요합니다.';
  end if;
  perform public._require_active_profile(auth.uid());
  if nullif(trim(p_title), '') is null then
    raise exception 'TITLE_REQUIRED: 활동 제목을 입력해 주세요.';
  end if;
  if p_location_type not in ('online', 'offline', 'hybrid') then
    raise exception 'INVALID_LOCATION_TYPE: 진행 방식을 선택해 주세요.';
  end if;
  if p_participation_mode not in ('solo', 'team', 'both') then
    raise exception 'INVALID_PARTICIPATION_MODE: 참여 형태를 선택해 주세요.';
  end if;

  v_source_url := nullif(trim(p_source_url), '');
  if v_source_url is not null and v_source_url !~* '^https?://' then
    raise exception 'INVALID_SOURCE_URL: 원문 링크는 http:// 또는 https://로 시작해야 합니다.';
  end if;

  if p_apply_start_at is not null and p_apply_end_at is not null and p_apply_start_at > p_apply_end_at then
    raise exception 'INVALID_DATE_RANGE: 접수 시작일이 마감일보다 늦을 수 없습니다.';
  end if;
  if p_activity_start_at is not null and p_activity_end_at is not null and p_activity_start_at > p_activity_end_at then
    raise exception 'INVALID_DATE_RANGE: 활동 시작일이 종료일보다 늦을 수 없습니다.';
  end if;

  select coalesce((value ->> 'submissions_per_day')::int, 5) into v_limit_per_day
    from public.app_settings where key = 'activity_submission_rate_limits';
  v_limit_per_day := coalesce(v_limit_per_day, 5);

  select count(*) into v_submitted_today from public.activities
    where created_by = auth.uid() and created_at > now() - interval '1 day';
  if v_submitted_today >= v_limit_per_day then
    raise exception 'RATE_LIMITED: 하루에 제보할 수 있는 활동 수(%)를 초과했습니다.', v_limit_per_day;
  end if;

  insert into public.activities (
    title, summary, description, org_name, source_url, location_type, region,
    participation_mode, status, is_demo, created_by,
    apply_start_at, apply_end_at, activity_start_at, activity_end_at,
    source_url_resolved, apply_end_at_evidence
  ) values (
    trim(p_title), nullif(trim(p_summary), ''), nullif(trim(p_description), ''),
    nullif(trim(p_org_name), ''), v_source_url, p_location_type,
    nullif(trim(p_region), ''), p_participation_mode, 'draft', false, auth.uid(),
    p_apply_start_at, p_apply_end_at, p_activity_start_at, p_activity_end_at,
    nullif(trim(p_source_url_resolved), ''), nullif(trim(p_apply_end_at_evidence), '')
  )
  returning id into v_activity_id;

  return v_activity_id;
end;
$$;

revoke all on function public.submit_activity(
  text, text, text, text, text, text, text, text,
  timestamptz, timestamptz, timestamptz, timestamptz, text, text
) from public, anon, authenticated;
grant execute on function public.submit_activity(
  text, text, text, text, text, text, text, text,
  timestamptz, timestamptz, timestamptz, timestamptz, text, text
) to authenticated;
