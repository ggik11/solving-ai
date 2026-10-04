-- 보안 수정: activities.source_url은 활동 상세(`/activities/[id]`)와 관리자 제보 검토 화면
-- (`/admin/submissions`)에서 `<a href={...}>`로 그대로 렌더링된다. React는 텍스트 콘텐츠는
-- 이스케이프하지만 속성값 자체(href)는 검사하지 않으므로, `javascript:...` 같은 스킴을 넣으면
-- 그 활동을 보거나(일반 사용자) 제보를 검토하는(운영자) 누구든 그 링크를 클릭하는 순간
-- 공격자가 넣은 스크립트가 실행된다(저장형 XSS) — 운영자 CRUD(`admin_write.test.ts`로 이미
-- "활동 등록/수정은 운영자만" 검증됨, 신뢰된 입력)와 달리 `submit_activity()`는 **일반 로그인
-- 사용자 누구나** 호출할 수 있는 경로라 실제로 악용 가능한 입구다.
--
-- 앱 레이어(src/lib/url.ts의 isHttpUrl(), 렌더링 시점에 http(s)가 아니면 링크를 만들지 않음)에
-- 이미 방어를 추가했지만, 이 함수 자체도 처음부터 http(s) 아닌 값을 저장하지 않도록 막아
-- 여러 겹으로 방어한다(앱 코드에 같은 실수가 다시 들어와도 DB가 막아준다).
create or replace function public.submit_activity(
  p_title text,
  p_summary text,
  p_description text,
  p_org_name text,
  p_source_url text,
  p_location_type text,
  p_region text,
  p_participation_mode text
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
    participation_mode, status, is_demo, created_by
  ) values (
    trim(p_title), nullif(trim(p_summary), ''), nullif(trim(p_description), ''),
    nullif(trim(p_org_name), ''), v_source_url, p_location_type,
    nullif(trim(p_region), ''), p_participation_mode, 'draft', false, auth.uid()
  )
  returning id into v_activity_id;

  return v_activity_id;
end;
$$;
