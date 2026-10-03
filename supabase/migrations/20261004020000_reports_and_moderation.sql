-- 5-A단계(신고·관리자·계정): reports/audit_logs 테이블·RLS는 2단계(기반)부터 있었지만 화면·DB
-- 함수가 전혀 없었다. 이번에 신고 생성·처리, 계정 정지, 신고된 메시지의 최소 범위 열람, 사용자
-- 활동 제보·승인, "쓰기 동작은 DB에서 막힌다"는 계정 정지 강제를 모두 연결한다.
--
-- 설계 메모:
-- - reports: 지시서 8장이 "사유 선택 + 설명"을 요구하므로 description 컬럼을 추가하고, reason을
--   고정 카테고리로 좁힌다(자유 텍스트였던 기존 컬럼을 CHECK로 제약). 생성은 빈도 제한이 필요해
--   (지시서 "로그인·OTP·지원·메시지·신고에는 빈도 제한을 적용") RLS 직접 insert를 막고
--   create_report() 함수를 거치게 한다(파티/채팅 함수와 같은 패턴).
-- - audit_logs: 모든 관리자 조치(신고 처리, 계정 정지/해제, 제보 승인/거절, 신고된 메시지 열람)를
--   _log_audit_action() 내부 헬퍼로 기록한다. "일반적인 전체 채팅 열람 도구는 만들지 않는다"는
--   원칙에 따라 get_reported_message_context()는 신고된 메시지 전후 몇 개만 반환하고, 그 조회
--   자체도 감사 로그에 남긴다.
-- - 계정 정지: profiles.account_status는 2단계부터 'suspended'/'withdrawn'을 이미 지원했지만
--   아무것도 이를 강제하지 않았다. parties/party_members/party_applications/chat_messages/
--   matching_queue/match_proposal_members에 BEFORE INSERT/UPDATE 트리거를 달아, 그 행을 쓰려는
--   "실제 행위자"(auth.uid())의 계정이 active가 아니면 거부한다. 기존 10여 개 SECURITY DEFINER
--   함수를 하나하나 고치는 대신 테이블 레벨 트리거로 공통화했다 — 앞으로 추가될 쓰기 경로도
--   자동으로 보호된다. auth.uid()가 null인 경우(서비스 롤 — 워커·시드·마이그레이션)는 "사용자
--   행위"가 아니므로 통과시킨다.
-- - 사용자 활동 제보: 별도 테이블을 새로 만들지 않고 기존 activities 테이블을 재사용한다 —
--   activities_select RLS가 "created_by = auth.uid()"를 이미 포함하고 있었고(2단계에서 미리
--   준비해 둔 것으로 보인다), CSV 가져오기도 이미 status='draft'로 비공개 등록하는 같은 패턴을
--   쓴다. submit_activity()가 일반 사용자 대신 draft 행을 만들고, 운영자는 /admin/submissions에서
--   그 draft 목록(자신이 만든 것 포함 — 의도적으로 구분하지 않음, 어차피 운영자가 직접 만든
--   초안도 같은 화면에서 공개 전환할 수 있어 유용하다)을 승인(공개)·거절(보관) 처리한다.

-- ---------------------------------------------------------------------------
-- 1. reports 스키마 보강: 사유 카테고리 + 설명 분리.
-- ---------------------------------------------------------------------------
alter table public.reports add column if not exists description text;
alter table public.reports drop constraint if exists reports_reason_check;
-- 기존 reason 값(비어있는 개발 DB 기준)은 새 제약과 충돌하지 않는다 — 운영 데이터가 아직 없다.
update public.reports set reason = 'other' where reason not in ('spam', 'harassment', 'inappropriate', 'scam', 'other');
alter table public.reports add constraint reports_reason_check
  check (reason in ('spam', 'harassment', 'inappropriate', 'scam', 'other'));

insert into public.app_settings (key, value, description) values
  ('report_rate_limits', '{"reports_per_hour": 5}'::jsonb,
   '신고 생성 빈도 제한(남용 방지). 사용자별 시간당 허용 신고 수.'),
  ('activity_submission_rate_limits', '{"submissions_per_day": 5}'::jsonb,
   '사용자 활동 제보 빈도 제한. 사용자별 하루 허용 제보 수.')
on conflict (key) do nothing;

-- reports는 이제 반드시 create_report()를 거친다(빈도 제한·유효성 검증 우회 방지).
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for insert with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. 감사 로그 헬퍼 — 외부에 공개하지 않는다(아래 SECURITY DEFINER 함수들이 내부에서 호출).
-- ---------------------------------------------------------------------------
create or replace function public._log_audit_action(
  p_action text,
  p_target_type text,
  p_target_id uuid,
  p_metadata jsonb default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), p_action, p_target_type, p_target_id, p_metadata);
end;
$$;

revoke all on function public._log_audit_action(text, text, uuid, jsonb) from public;

-- ---------------------------------------------------------------------------
-- 3. 신고 생성 — 빈도 제한 + 유효성 검증. 자기 자신(profile) 신고는 막는다.
-- ---------------------------------------------------------------------------
create or replace function public.create_report(
  p_target_type text,
  p_target_id uuid,
  p_reason text,
  p_description text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit_per_hour int;
  v_reported_this_hour int;
  v_report_id uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: 로그인이 필요합니다.';
  end if;
  if p_target_type not in ('profile', 'party', 'chat_message', 'activity') then
    raise exception 'INVALID_TARGET_TYPE: 신고 대상 유형이 올바르지 않습니다.';
  end if;
  if p_target_type = 'profile' and p_target_id = auth.uid() then
    raise exception 'CANNOT_REPORT_SELF: 자기 자신을 신고할 수 없습니다.';
  end if;
  if p_reason not in ('spam', 'harassment', 'inappropriate', 'scam', 'other') then
    raise exception 'INVALID_REASON: 신고 사유를 선택해 주세요.';
  end if;

  select coalesce((value ->> 'reports_per_hour')::int, 5) into v_limit_per_hour
    from public.app_settings where key = 'report_rate_limits';
  v_limit_per_hour := coalesce(v_limit_per_hour, 5);

  select count(*) into v_reported_this_hour from public.reports
    where reporter_id = auth.uid() and created_at > now() - interval '1 hour';
  if v_reported_this_hour >= v_limit_per_hour then
    raise exception 'RATE_LIMITED: 시간당 신고 가능 횟수(%)를 초과했습니다.', v_limit_per_hour;
  end if;

  insert into public.reports (reporter_id, target_type, target_id, reason, description, status)
  values (auth.uid(), p_target_type, p_target_id, p_reason, nullif(trim(p_description), ''), 'open')
  returning id into v_report_id;

  return v_report_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. 신고 상태 처리 — 운영자만. 상태 변경을 감사 로그에 남긴다.
-- ---------------------------------------------------------------------------
create or replace function public.update_report_status(
  p_report_id uuid,
  p_status text,
  p_resolution_note text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_status text;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: 운영자만 신고를 처리할 수 있습니다.';
  end if;
  if p_status not in ('open', 'reviewing', 'resolved', 'dismissed') then
    raise exception 'INVALID_STATUS: 신고 상태가 올바르지 않습니다.';
  end if;

  select status into v_old_status from public.reports where id = p_report_id for update;
  if v_old_status is null then
    raise exception 'REPORT_NOT_FOUND: 신고 내역을 찾을 수 없습니다.';
  end if;

  update public.reports
    set status = p_status,
        resolved_by = case when p_status in ('resolved', 'dismissed') then auth.uid() else resolved_by end,
        resolved_at = case when p_status in ('resolved', 'dismissed') then now() else resolved_at end
    where id = p_report_id;

  perform public._log_audit_action(
    'report_status_changed', 'report', p_report_id,
    jsonb_build_object('from', v_old_status, 'to', p_status, 'note', p_resolution_note)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. 신고된 메시지의 최소 범위 열람 — 그 메시지 전후 p_context_size개만. 운영자만.
--    "일반적인 전체 채팅 열람 도구는 만들지 않는다" — 이 함수가 유일한 관리자용 메시지 조회
--    경로이고, 호출 자체를 감사 로그에 남긴다.
-- ---------------------------------------------------------------------------
create or replace function public.get_reported_message_context(
  p_report_id uuid,
  p_context_size int default 3
) returns table (
  id uuid,
  sender_nickname text,
  message_type text,
  body text,
  created_at timestamptz,
  is_reported_message boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report record;
  v_message record;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: 운영자만 조회할 수 있습니다.';
  end if;

  select * into v_report from public.reports r where r.id = p_report_id;
  if not found then
    raise exception 'REPORT_NOT_FOUND: 신고 내역을 찾을 수 없습니다.';
  end if;
  if v_report.target_type <> 'chat_message' then
    raise exception 'NOT_A_MESSAGE_REPORT: 메시지 신고가 아닙니다.';
  end if;

  select cm.chat_room_id, cm.created_at into v_message
    from public.chat_messages cm where cm.id = v_report.target_id;
  if not found then
    raise exception 'MESSAGE_NOT_FOUND: 신고된 메시지를 찾을 수 없습니다(삭제되었을 수 있음).';
  end if;

  perform public._log_audit_action(
    'view_reported_message_context', 'report', p_report_id,
    jsonb_build_object('chat_message_id', v_report.target_id)
  );

  return query
    with context as (
      (
        select cm.id, cm.sender_id, cm.message_type, cm.body, cm.created_at
        from public.chat_messages cm
        where cm.chat_room_id = v_message.chat_room_id and cm.created_at <= v_message.created_at
        order by cm.created_at desc
        limit p_context_size + 1
      )
      union all
      (
        select cm.id, cm.sender_id, cm.message_type, cm.body, cm.created_at
        from public.chat_messages cm
        where cm.chat_room_id = v_message.chat_room_id and cm.created_at > v_message.created_at
        order by cm.created_at asc
        limit p_context_size
      )
    )
    select
      c.id, coalesce(p.nickname, '시스템'), c.message_type, c.body, c.created_at,
      c.id = v_report.target_id
    from context c
    left join public.profiles p on p.id = c.sender_id
    order by c.created_at asc;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. 계정 정지/해제 — 운영자만. 다른 운영자는 정지할 수 없다(안전장치).
-- ---------------------------------------------------------------------------
create or replace function public.suspend_account(p_profile_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_status text;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: 운영자만 계정을 정지할 수 있습니다.';
  end if;
  if public.is_admin_profile(p_profile_id) then
    raise exception 'CANNOT_SUSPEND_ADMIN: 운영자 계정은 이 화면에서 정지할 수 없습니다.';
  end if;

  select account_status into v_current_status from public.profiles where id = p_profile_id for update;
  if v_current_status is null then
    raise exception 'PROFILE_NOT_FOUND: 사용자를 찾을 수 없습니다.';
  end if;
  if v_current_status = 'withdrawn' then
    raise exception 'ACCOUNT_WITHDRAWN: 이미 탈퇴한 계정입니다.';
  end if;

  update public.profiles set account_status = 'suspended' where id = p_profile_id;

  perform public._log_audit_action('account_suspended', 'profile', p_profile_id, jsonb_build_object('reason', p_reason));
end;
$$;

create or replace function public.unsuspend_account(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_status text;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: 운영자만 정지를 해제할 수 있습니다.';
  end if;

  select account_status into v_current_status from public.profiles where id = p_profile_id for update;
  if v_current_status is null then
    raise exception 'PROFILE_NOT_FOUND: 사용자를 찾을 수 없습니다.';
  end if;
  if v_current_status <> 'suspended' then
    raise exception 'NOT_SUSPENDED: 정지 상태인 계정만 해제할 수 있습니다.';
  end if;

  update public.profiles set account_status = 'active' where id = p_profile_id;

  perform public._log_audit_action('account_unsuspended', 'profile', p_profile_id, null);
end;
$$;

-- user_roles는 2단계부터 있었지만 "특정 프로필이 admin인지" 묻는 헬퍼가 is_admin()(= 호출자
-- 본인)뿐이었다 — suspend_account가 "대상이 운영자인지"를 물어야 하므로 하나 추가한다.
create or replace function public.is_admin_profile(p_profile_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.user_roles ur where ur.profile_id = p_profile_id and ur.role = 'admin');
$$;

-- ---------------------------------------------------------------------------
-- 7. 계정 정지 강제 — 공통 트리거. "쓰기 동작(지원/메시지/매칭 참가/파티 생성 등)"을 테이블
--    레벨에서 막아, 함수를 하나하나 고치지 않고도 모든 경로(현재·향후)를 일괄 보호한다.
-- ---------------------------------------------------------------------------
create or replace function public._require_active_profile(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if p_profile_id is null then
    return; -- 서비스 롤 컨텍스트(워커/시드/마이그레이션) — 사용자 행위가 아니므로 통과.
  end if;
  select account_status into v_status from public.profiles where id = p_profile_id;
  if v_status is null or v_status = 'active' then
    return;
  end if;
  if v_status = 'suspended' then
    raise exception 'ACCOUNT_SUSPENDED: 정지된 계정입니다. 문의가 필요하면 운영자에게 연락해 주세요.';
  end if;
  if v_status = 'withdrawn' then
    raise exception 'ACCOUNT_WITHDRAWN: 탈퇴한 계정입니다.';
  end if;
end;
$$;

create or replace function public._enforce_active_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_active_profile(auth.uid());
  return new;
end;
$$;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'parties', 'party_members', 'party_applications',
    'chat_messages', 'matching_queue', 'match_proposal_members'
  ]
  loop
    execute format('drop trigger if exists enforce_active_account_trg on public.%I', tbl);
    execute format(
      'create trigger enforce_active_account_trg before insert or update on public.%I ' ||
      'for each row execute function public._enforce_active_account()',
      tbl
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. 사용자 활동 제보 + 운영자 승인/거절.
-- ---------------------------------------------------------------------------
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
    nullif(trim(p_org_name), ''), nullif(trim(p_source_url), ''), p_location_type,
    nullif(trim(p_region), ''), p_participation_mode, 'draft', false, auth.uid()
  )
  returning id into v_activity_id;

  return v_activity_id;
end;
$$;

create or replace function public.approve_activity_submission(p_activity_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity record;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: 운영자만 승인할 수 있습니다.';
  end if;

  select * into v_activity from public.activities where id = p_activity_id for update;
  if not found then
    raise exception 'ACTIVITY_NOT_FOUND: 활동을 찾을 수 없습니다.';
  end if;
  if v_activity.status <> 'draft' then
    raise exception 'ACTIVITY_NOT_DRAFT: 검토 대기 중인 제보가 아닙니다.';
  end if;

  update public.activities set status = 'published', last_verified_at = now() where id = p_activity_id;

  perform public._log_audit_action('activity_submission_approved', 'activity', p_activity_id, null);

  if v_activity.created_by is not null then
    perform public.create_notification(
      v_activity.created_by, 'activity_submission_approved', 'activity', p_activity_id,
      '제보한 활동이 승인되었어요', coalesce(v_activity.title, '활동') || ' 제보가 승인되어 공개되었습니다.',
      'activity_submission_approved:' || p_activity_id::text
    );
  end if;
end;
$$;

create or replace function public.reject_activity_submission(p_activity_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity record;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: 운영자만 거절할 수 있습니다.';
  end if;

  select * into v_activity from public.activities where id = p_activity_id for update;
  if not found then
    raise exception 'ACTIVITY_NOT_FOUND: 활동을 찾을 수 없습니다.';
  end if;
  if v_activity.status <> 'draft' then
    raise exception 'ACTIVITY_NOT_DRAFT: 검토 대기 중인 제보가 아닙니다.';
  end if;

  update public.activities set status = 'archived' where id = p_activity_id;

  perform public._log_audit_action('activity_submission_rejected', 'activity', p_activity_id, jsonb_build_object('note', p_note));

  if v_activity.created_by is not null then
    perform public.create_notification(
      v_activity.created_by, 'activity_submission_rejected', 'activity', p_activity_id,
      '제보한 활동이 반영되지 않았어요',
      coalesce(p_note, coalesce(v_activity.title, '활동') || ' 제보가 이번에는 반영되지 않았습니다.'),
      'activity_submission_rejected:' || p_activity_id::text
    );
  end if;
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
    'create_report(text, uuid, text, text)',
    'update_report_status(uuid, text, text)',
    'get_reported_message_context(uuid, int)',
    'suspend_account(uuid, text)',
    'unsuspend_account(uuid)',
    'submit_activity(text, text, text, text, text, text, text, text)',
    'approve_activity_submission(uuid)',
    'reject_activity_submission(uuid, text)'
  ]
  loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end;
$$;
