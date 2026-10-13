-- 개발/데모 시드. `supabase db reset` 시 매번 재실행된다. 전부 상대 날짜(now() 기준)로 생성해
-- 마감/모집중/접수예정 상태를 재현한다. 실제 운영 데이터가 아니며 is_demo=true로 표시한다.

-- ===========================================================================
-- 1. 테스트 계정 (auth.users + profiles). 비밀번호 없는 매직링크 계정으로 생성한다.
--    로그인은 README의 매직링크/OTP 절차 또는 테스트 하네스의 admin.generateLink로 확인한다.
-- ===========================================================================
do $$
declare
  v_instance_id uuid := '00000000-0000-0000-0000-000000000000';
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) values
    (v_instance_id, 'a0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'admin@smu.ac.kr', '',
     now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
    (v_instance_id, 'a0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'student1@smu.ac.kr', '',
     now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
    (v_instance_id, 'a0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'student2@smu.ac.kr', '',
     now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
    (v_instance_id, 'a0000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'student3@smu.ac.kr', '',
     now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
    (v_instance_id, 'a0000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'student4@smu.ac.kr', '',
     now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
  on conflict (id) do nothing;

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), u.id, u.id::text,
         jsonb_build_object('sub', u.id::text, 'email', u.email),
         'email', now(), now(), now()
  from auth.users u
  where u.id in (
    'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004',
    'a0000000-0000-0000-0000-000000000005'
  )
  on conflict do nothing;
end $$;

-- handle_new_user 트리거가 profiles 행을 이미 만들어뒀으므로 UPDATE로 데모 값을 채운다.
update public.profiles set nickname = '운영자데모', account_status = 'active', onboarding_completed_at = now()
  where id = 'a0000000-0000-0000-0000-000000000001';
update public.profiles set nickname = '기획러민지', campus_verified = true, grade = 2, academic_status = 'enrolled',
    bio = '기획/운영 역할을 선호합니다.', preferred_location_type = 'hybrid', preferred_region = '서울',
    weekly_available_hours = 6, experience = '교내 홍보 서포터즈 1년 활동', onboarding_completed_at = now(),
    major_status = 'assigned'
  where id = 'a0000000-0000-0000-0000-000000000002';
update public.profiles set nickname = '개발자준호', campus_verified = true, grade = 3, academic_status = 'enrolled',
    bio = '프론트엔드 개발에 관심 있습니다.', preferred_location_type = 'online', preferred_region = null,
    weekly_available_hours = 10, experience = '교내 해커톤 2회 참가', onboarding_completed_at = now(),
    major_status = 'assigned'
  where id = 'a0000000-0000-0000-0000-000000000003';
update public.profiles set nickname = '디자이너소은', campus_verified = false, grade = 1, academic_status = 'enrolled',
    bio = '포트폴리오용 디자인 활동을 찾습니다.', preferred_location_type = 'offline', preferred_region = '서울',
    weekly_available_hours = 4, onboarding_completed_at = now(),
    major_status = 'assigned'
  where id = 'a0000000-0000-0000-0000-000000000004';
update public.profiles set nickname = '마케터하늘', campus_verified = true, grade = 4, academic_status = 'leave_of_absence',
    bio = '주말에만 참여 가능합니다.', preferred_location_type = 'hybrid', preferred_region = '서울/온라인',
    weekly_available_hours = 3, onboarding_completed_at = now(),
    major_status = 'assigned'
  where id = 'a0000000-0000-0000-0000-000000000005';

insert into public.user_roles (profile_id, role) values ('a0000000-0000-0000-0000-000000000001', 'admin')
  on conflict (profile_id) do nothing;

-- 서로 다른 가능 시간대 (요일·시간대가 모두 다르게) — 전체 교집합 계산 데모용.
insert into public.availability_slots (profile_id, day_of_week, start_time, end_time) values
  ('a0000000-0000-0000-0000-000000000002', 1, '09:00', '12:00'), -- 월 오전
  ('a0000000-0000-0000-0000-000000000002', 3, '19:00', '21:00'), -- 수 저녁
  ('a0000000-0000-0000-0000-000000000003', 2, '13:00', '18:00'), -- 화 오후
  ('a0000000-0000-0000-0000-000000000003', 1, '10:00', '12:00'), -- 월 오전 (student1과 일부 중첩)
  ('a0000000-0000-0000-0000-000000000004', 3, '18:00', '22:00'), -- 수 저녁 (student1과 일부 중첩)
  ('a0000000-0000-0000-0000-000000000005', 6, '09:00', '18:00'), -- 토요일 종일
  ('a0000000-0000-0000-0000-000000000005', 0, '09:00', '18:00'); -- 일요일 종일

-- ===========================================================================
-- 2. 참조 데이터: majors(데모 표시, 비활성), interests(서비스 분야 12개), skills
-- ===========================================================================
-- 2단계부터 있던 데모 전공 5개. 서울캠퍼스 공식 목록(마이그레이션 20261013010000)이 들어온 뒤로는
-- is_active=false로 비활성화하되, 이미 배정된 데모 프로필 참조가 깨지지 않도록 지우지 않는다.
insert into public.majors (id, college, department, name, is_demo, is_active) values
  ('b0000000-0000-0000-0000-000000000001', '인문사회과학대학', '국어교육과', '국어교육학 전공', true, false),
  ('b0000000-0000-0000-0000-000000000002', '경영경제대학', '경영학부', '경영학 전공', true, false),
  ('b0000000-0000-0000-0000-000000000003', '융합공과대학', '컴퓨터과학과', '컴퓨터과학 전공', true, false),
  ('b0000000-0000-0000-0000-000000000004', '문화예술대학', '디자인학부', '시각디자인 전공', true, false),
  ('b0000000-0000-0000-0000-000000000005', '융합공과대학', '컴퓨터과학과', '소프트웨어공학 전공', true, false)
on conflict do nothing;

-- 2단계 데모 전공(b0000000-...)은 마이그레이션 20261013010000에서 is_active=false로 비활성화됐고
-- major_field_weights 연결표는 서울캠퍼스 공식 전공(e0000000-...)에만 있다. 비활성 전공을 그대로
-- 참조하면 major_field_weights 조인이 항상 빈 결과라 추천의 "전공" 항목이 영원히 0/근거 없음으로
-- 나온다 — 데모 학생 4명을 공식 전공으로 바꿔 이어준다(관심분야·소개와 맞춰 선택).
insert into public.profile_majors (profile_id, major_id) values
  ('a0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000011'), -- 기획러민지: 교육학과(EDUCATION_STUDIES, 교육·멘토링/복지 관심과 연결)
  ('a0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000021'), -- 개발자준호: 컴퓨터과학전공(COMPUTER_SCIENCE, IT·AI·데이터 관심과 일치)
  ('a0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000033'), -- 디자이너소은: 조형예술전공(PLASTIC_ART, 디자인 관심과 일치)
  ('a0000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000015')  -- 마케터하늘: 글로벌경영학과(GLOBAL_BUSINESS, 경영·마케팅·금융 관심과 일치)
on conflict do nothing;

-- 서비스 분야 12개는 마이그레이션(20261013010000)이 고정 UUID로 직접 등록한다 — 여기서는 다시 넣지 않는다.

-- 지시서 4장 "할 수 있는 역할" 어휘를 그대로 쓴다.
insert into public.skills (id, name) values
  ('d0000000-0000-0000-0000-000000000001', '기획'),
  ('d0000000-0000-0000-0000-000000000002', '개발'),
  ('d0000000-0000-0000-0000-000000000003', '자료조사'),
  ('d0000000-0000-0000-0000-000000000004', '디자인'),
  ('d0000000-0000-0000-0000-000000000005', '발표'),
  ('d0000000-0000-0000-0000-000000000006', '영상'),
  ('d0000000-0000-0000-0000-000000000007', '글쓰기')
on conflict do nothing;

insert into public.profile_interests (profile_id, interest_id) values
  ('a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000003'),
  ('a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000006'),
  ('a0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000005'),
  ('a0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000004')
on conflict do nothing;

insert into public.profile_skills (profile_id, skill_id) values
  ('a0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000004'),
  ('a0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000005')
on conflict do nothing;

insert into public.profile_preferred_activity_types (profile_id, activity_type_id)
select 'a0000000-0000-0000-0000-000000000002'::uuid, id from public.activity_types where name in ('공모전', '교육·캠프')
union all
select 'a0000000-0000-0000-0000-000000000003'::uuid, id from public.activity_types where name in ('해커톤', '창업')
union all
select 'a0000000-0000-0000-0000-000000000004'::uuid, id from public.activity_types where name = '공모전'
union all
select 'a0000000-0000-0000-0000-000000000005'::uuid, id from public.activity_types where name = '서포터즈'
on conflict do nothing;

-- ===========================================================================
-- 3. 활동 20개 이상 (상대 날짜: 모집중 / 마감임박 / 접수예정 / 마감 혼합)
-- ===========================================================================
insert into public.activity_types (name, is_demo) values
  ('공모전', true), ('서포터즈', true), ('봉사', true),
  ('해커톤', true), ('창업', true), ('교육·캠프', true)
on conflict do nothing;

with gen as (
  select
    i,
    (array['에너지·소재·환경·도시','IT·AI·데이터','교육·멘토링','경영·마케팅·금융','디자인·영상·애니메이션·게임콘텐츠','복지·지역사회·사회공헌'])[1 + (i % 6)] as category,
    (array['공모전','서포터즈','봉사','해커톤','창업','교육·캠프'])[1 + (i % 6)] as kind,
    (array['online','offline','hybrid'])[1 + (i % 3)] as location_type,
    (array['solo','team','both'])[1 + (i % 3)] as participation_mode,
    case (i % 4)
      when 0 then now() - interval '10 days'   -- 접수 시작: 이미 진행 중
      when 1 then now() - interval '1 days'     -- 마감 임박
      when 2 then now() + interval '3 days'     -- 접수예정 (아직 시작 전)
      else now() - interval '20 days'           -- 이미 마감
    end as apply_start_at,
    case (i % 4)
      when 0 then now() + interval '14 days'    -- 모집중
      when 1 then now() + interval '1 days'      -- 마감임박
      when 2 then now() + interval '10 days'     -- 접수예정
      else now() - interval '3 days'             -- 마감
    end as apply_end_at,
    case (i % 4) when 3 then 'closed' else 'published' end as status,
    -- 3개 중 1개는 "원문 확인 필요" 배지를 보여주기 위해 last_verified_at을 비워두거나 오래된 값으로 남긴다.
    case (i % 3)
      when 0 then null
      when 1 then now() - interval '40 days'
      else now() - interval '2 days'
    end as last_verified_at
  from generate_series(1, 22) as i
)
insert into public.activities (
  title, summary, description, org_name, source_url, location_type, region,
  activity_type_id, eligibility, participation_mode, team_min_size, team_max_size, benefit,
  apply_start_at, apply_end_at, activity_start_at, activity_end_at,
  status, is_demo, created_by, last_verified_at
)
select
  format('%s %s 모집 %s기', kind, category, i),
  format('%s 분야 %s 데모 한 줄 요약입니다.', category, kind),
  format('%s 분야 %s 데모 활동입니다. 실제 공고가 아니며 운영자 확인 전 샘플 데이터입니다.', category, kind),
  format('데모기관%s', 1 + (i % 7)),
  format('https://example.org/activities/%s', i),
  location_type,
  case location_type when 'offline' then '서울' when 'hybrid' then '서울/온라인' else null end,
  (select id from public.activity_types where name = kind),
  '상명대학교 서울캠퍼스 재학생 (데모 자격 조건, 실제 공고 확인 필요)',
  participation_mode,
  case when participation_mode = 'solo' then null else 2 end,
  case when participation_mode = 'solo' then null else 4 + (i % 3) end,
  '데모 혜택: 활동 확인서 발급 (실제 공고 확인 필요)',
  apply_start_at, apply_end_at,
  apply_end_at + interval '7 days', apply_end_at + interval '37 days',
  status, true, 'a0000000-0000-0000-0000-000000000001', last_verified_at
from gen;

insert into public.activity_tags (activity_id, tag)
select a.id, t.tag
from public.activities a
cross join lateral (values (split_part(a.title, ' ', 2))) as t(tag)
where a.is_demo = true;

-- 분야 확정(activity_fields, 가이드 3.2): G2부터 추천의 "관심분야"·"전공" 항목은 activity_tags가
-- 아니라 activity_fields만 읽는다. 제목의 두 번째 단어(위 activity_tags와 같은 값)가 곧 생성 시
-- 고른 서비스 분야 카테고리이므로 그대로 대표 분야로 확정한다. 운영 원칙(관리자가 등록한 실제
-- 활동은 관리자가 직접 확정) 그대로, 여기서도 "관리자데모" 계정이 확정한 것으로 기록한다.
-- 생성 순번(제목 끝의 "N기")이 7의 배수인 활동은 의도적으로 비워 둬 "분야 미확정" 배지가
-- 실제로 보이게 한다(마이그레이션이 아니라 이 데모 시드에서만 하는 선택 — 실제 활동의 분야 확정은
-- 관리자가 운영 화면에서 직접 한다).
insert into public.activity_fields (activity_id, interest_id, role, source, confirmed_by, confirmed_at)
select
  a.id,
  i.id,
  'primary',
  'manual',
  'a0000000-0000-0000-0000-000000000001',
  now()
from public.activities a
join public.interests i on i.name = split_part(a.title, ' ', 2)
where a.is_demo = true
  and mod((trim(trailing '기' from split_part(a.title, ' ', 4)))::int, 7) <> 0;

-- 일부 카테고리는 실제로도 겹치는 부가 분야를 하나 더 둔다(예: IT 해커톤류는 전기·전자·제조·공학과도
-- 겹침). 대표 분야가 미확정으로 남은 활동(위에서 제외됨)에는 부가 분야도 넣지 않는다.
insert into public.activity_fields (activity_id, interest_id, role, source, confirmed_by, confirmed_at)
select
  a.id,
  i2.id,
  'secondary',
  'manual',
  'a0000000-0000-0000-0000-000000000001',
  now()
from public.activities a
join public.interests i on i.name = split_part(a.title, ' ', 2)
join public.interests i2 on i2.name = case i.name
  when '에너지·소재·환경·도시' then '바이오·식품·영양·보건'
  when 'IT·AI·데이터' then '전기·전자·제조·공학'
  when '교육·멘토링' then '복지·지역사회·사회공헌'
  when '디자인·영상·애니메이션·게임콘텐츠' then '미술·음악·공연·무용'
  else null
end
where a.is_demo = true
  and mod((trim(trailing '기' from split_part(a.title, ' ', 4)))::int, 7) <> 0;

-- ===========================================================================
-- 4. 수동 파티 데모: 모집중 파티 1개 + 확정된 파티 1개 (chat_rooms는 트리거가 자동 생성)
-- ===========================================================================
do $$
declare
  v_activity_id uuid;
  v_party_recruiting uuid;
  v_party_confirmed uuid;
  v_slot_plan uuid;
  v_slot_dev uuid;
begin
  select id into v_activity_id from public.activities where is_demo = true and status = 'published' order by id limit 1;

  insert into public.parties (id, activity_id, source, leader_id, title, description, capacity, meeting_mode, status, recruit_deadline)
  values (gen_random_uuid(), v_activity_id, 'manual', 'a0000000-0000-0000-0000-000000000002',
          '기획+개발 2인 모집', '같이 아이디어 내고 빠르게 실행할 팀원을 구합니다.', 2, 'hybrid', 'recruiting', now() + interval '5 days')
  returning id into v_party_recruiting;

  insert into public.party_role_slots (party_id, role_name, capacity) values
    (v_party_recruiting, '기획', 1), (v_party_recruiting, '개발', 1);

  select id into v_slot_plan from public.party_role_slots where party_id = v_party_recruiting and role_name = '기획';

  insert into public.party_members (party_id, profile_id, role_slot_id, is_leader)
  values (v_party_recruiting, 'a0000000-0000-0000-0000-000000000002', v_slot_plan, true);

  insert into public.party_applications (party_id, profile_id, role_slot_id, message, status)
  select v_party_recruiting, 'a0000000-0000-0000-0000-000000000003',
         (select id from public.party_role_slots where party_id = v_party_recruiting and role_name = '개발'),
         '프론트엔드 경험 있습니다. 지원합니다!', 'pending';

  -- 이미 확정된 파티 (승인 즉시 채팅 가능함을 보여주는 데모; confirmed는 팀 확정 상태일 뿐).
  insert into public.parties (id, activity_id, source, leader_id, title, description, capacity, meeting_mode, status)
  values (gen_random_uuid(), v_activity_id, 'manual', 'a0000000-0000-0000-0000-000000000004',
          '디자인 2인 확정팀', '디자인 공모전 출전용으로 이미 팀이 꾸려졌습니다.', 2, 'online', 'confirmed')
  returning id into v_party_confirmed;

  insert into public.party_role_slots (party_id, role_name, capacity) values
    (v_party_confirmed, '디자인', 2);

  select id into v_slot_dev from public.party_role_slots where party_id = v_party_confirmed and role_name = '디자인';

  insert into public.party_members (party_id, profile_id, role_slot_id, is_leader) values
    (v_party_confirmed, 'a0000000-0000-0000-0000-000000000004', v_slot_dev, true),
    (v_party_confirmed, 'a0000000-0000-0000-0000-000000000005', v_slot_dev, false);

  -- 확정 파티 채팅방에 데모 메시지
  insert into public.chat_messages (chat_room_id, sender_id, message_type, body)
  select cr.id, 'a0000000-0000-0000-0000-000000000004', 'system', '디자이너소은님이 팀을 확정했습니다.'
  from public.chat_rooms cr where cr.party_id = v_party_confirmed;

  insert into public.chat_messages (chat_room_id, sender_id, message_type, body)
  select cr.id, 'a0000000-0000-0000-0000-000000000005', 'text', '안녕하세요! 잘 부탁드립니다.'
  from public.chat_rooms cr where cr.party_id = v_party_confirmed;

  insert into public.chat_read_states (chat_room_id, profile_id, last_read_at)
  select cr.id, 'a0000000-0000-0000-0000-000000000004', now()
  from public.chat_rooms cr where cr.party_id = v_party_confirmed;
end $$;

-- ===========================================================================
-- 5. 빠른 매칭 데모 (4-B): 역할 구성 템플릿 3개 + 매칭 사례 3개
--    - 이미 확정된 매칭 결과 1개 (과거 이력 화면 데모)
--    - "student1이 참가하면 바로 제안이 생기는" 활동 1개 (student2가 이미 호환되는 역할·시간으로 대기 중)
--    - "시간이 안 맞아 대기만 하는" 활동 1개 (student5가 주말에만 가능 — student1은 평일만 가능해 교집합 없음)
-- ===========================================================================
do $$
declare
  v_activity_matched uuid;
  v_activity_instant uuid;
  v_activity_waiting uuid;
  v_template_matched uuid;
  v_template_instant uuid;
  v_template_waiting uuid;
  v_proposal_id uuid;
  v_party_id uuid;
  v_slot_id uuid;
  v_queue_dev uuid;
  v_queue_mkt uuid;
begin
  select id into v_activity_matched from public.activities
    where is_demo = true and status = 'published' and participation_mode <> 'solo' order by id desc limit 1;
  select id into v_activity_instant from public.activities
    where is_demo = true and status = 'published' and participation_mode <> 'solo' order by id asc limit 1 offset 3;
  select id into v_activity_waiting from public.activities
    where is_demo = true and status = 'published' and participation_mode <> 'solo' order by id asc limit 1 offset 8;

  -- 5-1. 이미 확정된 매칭 결과 (과거 이력 데모).
  insert into public.activity_match_templates (id, activity_id, name) values
    (gen_random_uuid(), v_activity_matched, '2인: 개발+마케팅') returning id into v_template_matched;
  insert into public.activity_match_template_roles (template_id, role_name, capacity) values
    (v_template_matched, '개발', 1), (v_template_matched, '마케팅', 1);

  insert into public.matching_queue (id, activity_id, profile_id, template_id, eligible_roles, willing_leader, status)
  values
    (gen_random_uuid(), v_activity_matched, 'a0000000-0000-0000-0000-000000000003', v_template_matched, array['개발'], true, 'matched'),
    (gen_random_uuid(), v_activity_matched, 'a0000000-0000-0000-0000-000000000005', v_template_matched, array['마케팅'], false, 'matched');

  select id into v_queue_dev from public.matching_queue where activity_id = v_activity_matched and profile_id = 'a0000000-0000-0000-0000-000000000003';
  select id into v_queue_mkt from public.matching_queue where activity_id = v_activity_matched and profile_id = 'a0000000-0000-0000-0000-000000000005';

  insert into public.parties (id, activity_id, source, leader_id, title, capacity, status)
  values (gen_random_uuid(), v_activity_matched, 'matching', 'a0000000-0000-0000-0000-000000000003', '빠른 매칭 확정팀', 2, 'confirmed')
  returning id into v_party_id;

  insert into public.party_role_slots (party_id, role_name, capacity) values
    (v_party_id, '개발', 1), (v_party_id, '마케팅', 1);

  select id into v_slot_id from public.party_role_slots where party_id = v_party_id and role_name = '개발';
  insert into public.party_members (party_id, profile_id, role_slot_id, is_leader) values
    (v_party_id, 'a0000000-0000-0000-0000-000000000003', v_slot_id, true);

  select id into v_slot_id from public.party_role_slots where party_id = v_party_id and role_name = '마케팅';
  insert into public.party_members (party_id, profile_id, role_slot_id, is_leader) values
    (v_party_id, 'a0000000-0000-0000-0000-000000000005', v_slot_id, false);

  insert into public.match_proposals (activity_id, template_id, status, proposed_leader_profile_id, expires_at, party_id)
  values (v_activity_matched, v_template_matched, 'matched', 'a0000000-0000-0000-0000-000000000003', now() + interval '24 hours', v_party_id)
  returning id into v_proposal_id;

  insert into public.match_proposal_members (proposal_id, profile_id, queue_id, role_name, response, responded_at) values
    (v_proposal_id, 'a0000000-0000-0000-0000-000000000003', v_queue_dev, '개발', 'accepted', now()),
    (v_proposal_id, 'a0000000-0000-0000-0000-000000000005', v_queue_mkt, '마케팅', 'accepted', now());

  -- 5-2. "바로 성사" 데모: student2(개발자준호, 월 10-12 가능)가 이미 "개발" 역할로 대기 중이다.
  -- student1(기획러민지)은 월 9-12에 가능하므로 "기획" 역할로 참가하면 교집합 월 10-12(120분)로
  -- 즉시 제안 조건을 만족한다(최소 60분). /match/[activityId]에서 직접 참가해 워커를 돌려보면 된다.
  insert into public.activity_match_templates (id, activity_id, name) values
    (gen_random_uuid(), v_activity_instant, '2인: 기획+개발') returning id into v_template_instant;
  insert into public.activity_match_template_roles (template_id, role_name, capacity) values
    (v_template_instant, '기획', 1), (v_template_instant, '개발', 1);

  insert into public.matching_queue (activity_id, profile_id, template_id, eligible_roles, willing_leader, continue_on_fail, status)
  values (v_activity_instant, 'a0000000-0000-0000-0000-000000000003', v_template_instant, array['개발'], false, true, 'waiting');

  -- 5-3. "대기만" 데모: student5(마케터하늘, 토/일만 가능)가 "마케팅" 역할로 대기 중이다.
  -- student1(월/수만 가능)이 참가해도 겹치는 요일이 아예 없어 전체 공통 시간이 0이므로
  -- 워커를 돌려도 계속 대기 상태로 남는다.
  insert into public.activity_match_templates (id, activity_id, name) values
    (gen_random_uuid(), v_activity_waiting, '2인: 마케팅+디자인') returning id into v_template_waiting;
  insert into public.activity_match_template_roles (template_id, role_name, capacity) values
    (v_template_waiting, '마케팅', 1), (v_template_waiting, '디자인', 1);

  insert into public.matching_queue (activity_id, profile_id, template_id, eligible_roles, willing_leader, continue_on_fail, status)
  values (v_activity_waiting, 'a0000000-0000-0000-0000-000000000005', v_template_waiting, array['마케팅'], true, true, 'waiting');
end $$;

-- ===========================================================================
-- 6. 알림 / 차단 / 신고 데모
-- ===========================================================================
insert into public.notifications (profile_id, type, title, body, dedupe_key) values
  ('a0000000-0000-0000-0000-000000000003', 'party_application_received', '새 지원이 도착했어요',
   '기획+개발 2인 모집 파티에 새로운 지원이 있습니다.', 'party_application_received:demo-1'),
  ('a0000000-0000-0000-0000-000000000005', 'match_proposal_matched', '매칭이 확정됐어요',
   '빠른 매칭 제안이 확정되어 팀 채팅방이 생성되었습니다.', 'match_proposal_matched:demo-1')
on conflict do nothing;

-- 차단 데모 데이터는 두지 않는다 — 5-A단계부터 apply_to_party/send_chat_message가 실제로
-- blocks를 읽으므로, 시드에 고정 차단 관계를 두면 그 관계와 무관한 다른 테스트(파티 지원 등)가
-- 공유 테스트 계정(student1~4) 조합에 따라 우연히 영향을 받는다. 차단이 필요한 테스트는
-- 각자 블록을 만들고 끝나면 정리한다(tests/rls/blocking.test.ts, matching_*.test.ts).

insert into public.reports (reporter_id, target_type, target_id, reason, description, status)
select 'a0000000-0000-0000-0000-000000000002', 'profile', 'a0000000-0000-0000-0000-000000000004',
       'other', '데모용 신고 샘플입니다.', 'open';
