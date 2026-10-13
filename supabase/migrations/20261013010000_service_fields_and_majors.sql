-- 9장 G1: 공통 어휘(서비스 분야 12개)와 전공(서울캠퍼스 공식 목록)을 등록한다.
-- 설계 근거: docs/teachable-machine-integration.md 3.1/3.3/3.4, docs/tm-design-guidelines-original.md 8.1/8.3.
-- 기존 마이그레이션은 수정하지 않고 이 파일로만 추가한다.

-- ---------------------------------------------------------------------------
-- 1. interests: 서비스 분야 12개 공통 어휘로 확장
-- ---------------------------------------------------------------------------
alter table public.interests
  add column code text,
  add column sort_order smallint,
  add column is_active boolean not null default true;

-- on conflict (code)로 채우기 전에 유니크 제약을 먼저 걸어야 한다 (code는 아직 전부 null이라 허용됨).
alter table public.interests add constraint interests_code_key unique (code);

alter table public.profile_interests
  add column priority smallint check (priority is null or priority > 0);

comment on column public.profile_interests.priority is
  '1=가장 관심, null=균등(우선순위 미설정). 가이드 3.1/8.5.';

-- 12개 분야를 이 마이그레이션이 직접, 고정 UUID로 등록한다(마이그레이션은 db reset 때 seed.sql보다
-- 먼저 실행되므로, "기존 데모 행을 이름으로 찾아 이름만 바꾸는" 방식은 신선한 환경에서 대상이
-- 없어 아무 일도 하지 않는다 — 처음에 이 방식으로 작성했다가 major_field_weights가 참조할 행이
-- 없어서 실패하는 것을 보고 바로잡았다). 앞 6개는 기존 데모 관심분야와 같은 id를 그대로 쓴다.
insert into public.interests (id, code, name, sort_order) values
  ('c0000000-0000-0000-0000-000000000001', 'ENERGY_ENVIRONMENT', '에너지·소재·환경·도시', 9),
  ('c0000000-0000-0000-0000-000000000002', 'IT_DATA', 'IT·AI·데이터', 1),
  ('c0000000-0000-0000-0000-000000000003', 'EDUCATION', '교육·멘토링', 6),
  ('c0000000-0000-0000-0000-000000000004', 'BUSINESS_FINANCE', '경영·마케팅·금융', 3),
  ('c0000000-0000-0000-0000-000000000005', 'DESIGN_MEDIA', '디자인·영상·애니메이션·게임콘텐츠', 10),
  ('c0000000-0000-0000-0000-000000000006', 'SOCIAL_WELFARE', '복지·지역사회·사회공헌', 7),
  ('c0000000-0000-0000-0000-000000000007', 'ENGINEERING', '전기·전자·제조·공학', 2),
  ('c0000000-0000-0000-0000-000000000008', 'HUMANITIES_CULTURE', '인문·역사·문화콘텐츠', 4),
  ('c0000000-0000-0000-0000-000000000009', 'LAW_POLICY', '법·지식재산권·정책·안보', 5),
  ('c0000000-0000-0000-0000-000000000010', 'BIO_FOOD_HEALTH', '바이오·식품·영양·보건', 8),
  ('c0000000-0000-0000-0000-000000000011', 'ARTS_PERFORMANCE', '미술·음악·공연·무용', 11),
  ('c0000000-0000-0000-0000-000000000012', 'SPORTS', '스포츠·운동·건강관리', 12)
on conflict (id) do update set
  code = excluded.code, name = excluded.name, sort_order = excluded.sort_order, is_active = true;

alter table public.interests alter column code set not null;

comment on column public.interests.code is
  '서비스 분야 고정 ID(가이드 3.1의 12개). 관심분야·활동 분야·전공 연결표·모델 연결표가 공통으로 참조한다.';

-- ---------------------------------------------------------------------------
-- 2. majors: 서울캠퍼스 공식 목록으로 확장 (가이드 3.3, 원 가이드라인 8.1)
-- ---------------------------------------------------------------------------
alter table public.majors
  add column code text,
  add column campus text not null default 'SMU_SEOUL',
  add column is_active boolean not null default true,
  add column sort_order smallint,
  add column source_url text,
  add column verified_at timestamptz;

alter table public.majors add constraint majors_code_key unique (code);

comment on column public.majors.code is
  '서비스 내부 고정 ID. 학교의 공식 학사 코드라고 주장하지 않는다 (원 가이드라인 8.6).';

-- 기존 데모 전공(2단계부터 있던 5개)은 비활성으로 전환하고 유지한다 — 지우면 이미 배정된
-- 데모 프로필(profile_majors)의 참조가 깨진다.
update public.majors set is_active = false where is_demo = true;

-- 2026-10-13 확인한 상명대학교 공식 서울캠퍼스 대학소개 페이지(https://www.smu.ac.kr/kor/edu/seoul01.do)
-- 표기를 그대로 등록한다. 학부 자체가 최종 선택 단위인 항목은 학부명을 department/name에 그대로 쓴다.
insert into public.majors (id, code, college, department, name, campus, is_active, sort_order, source_url, verified_at) values
  ('e0000000-0000-0000-0000-000000000001', 'HISTORY_CONTENT', '인문사회과학대학', '인문콘텐츠학부', '역사콘텐츠전공', 'SMU_SEOUL', true, 1, 'https://www.smu.ac.kr/kor/edu/seoul01.do', '2026-10-13 00:00:00+09'),
  ('e0000000-0000-0000-0000-000000000002', 'IP_LAW', '인문사회과학대학', '인문콘텐츠학부', '지적재산권전공', 'SMU_SEOUL', true, 2, 'https://www.smu.ac.kr/kor/edu/seoul01.do', '2026-10-13 00:00:00+09'),
  ('e0000000-0000-0000-0000-000000000003', 'LIBRARY_INFO', '인문사회과학대학', '인문콘텐츠학부', '문헌정보학전공', 'SMU_SEOUL', true, 3, 'https://www.smu.ac.kr/kor/edu/seoul01.do', '2026-10-13 00:00:00+09'),
  ('e0000000-0000-0000-0000-000000000004', 'KOREA_JAPAN_CULTURE', '인문사회과학대학', '인문콘텐츠학부', '한일문화콘텐츠전공', 'SMU_SEOUL', true, 4, 'https://www.smu.ac.kr/kor/edu/seoul01.do', '2026-10-13 00:00:00+09'),
  ('e0000000-0000-0000-0000-000000000005', 'SPATIAL_ENVIRONMENT', '인문사회과학대학', '공간환경학부', '공간환경학부', 'SMU_SEOUL', true, 5, 'https://www.smu.ac.kr/kor/edu/seoul01.do', '2026-10-13 00:00:00+09'),
  ('e0000000-0000-0000-0000-000000000006', 'PUBLIC_ADMINISTRATION', '인문사회과학대학', '행정학부', '행정학부', 'SMU_SEOUL', true, 6, 'https://www.smu.ac.kr/kor/edu/seoul01.do', '2026-10-13 00:00:00+09'),
  ('e0000000-0000-0000-0000-000000000007', 'FAMILY_WELFARE', '인문사회과학대학', '가족복지학과', '가족복지학과', 'SMU_SEOUL', true, 7, 'https://www.smu.ac.kr/kor/edu/seoul01.do', '2026-10-13 00:00:00+09'),
  ('e0000000-0000-0000-0000-000000000008', 'NATIONAL_SECURITY', '인문사회과학대학', '국가안보학과', '국가안보학과', 'SMU_SEOUL', true, 8, 'https://www.smu.ac.kr/kor/edu/seoul01.do', '2026-10-13 00:00:00+09'),
  ('e0000000-0000-0000-0000-000000000009', 'KOREAN_EDUCATION', '사범대학', '국어교육과', '국어교육과', 'SMU_SEOUL', true, 9, 'https://www.smu.ac.kr/kor/edu/seoul01.do', '2026-10-13 00:00:00+09'),
  ('e0000000-0000-0000-0000-000000000010', 'ENGLISH_EDUCATION', '사범대학', '영어교육과', '영어교육과', 'SMU_SEOUL', true, 10, 'https://www.smu.ac.kr/kor/edu/seoul01.do', '2026-10-13 00:00:00+09'),
  ('e0000000-0000-0000-0000-000000000011', 'EDUCATION_STUDIES', '사범대학', '교육학과', '교육학과', 'SMU_SEOUL', true, 11, 'https://www.smu.ac.kr/kor/edu/seoul01.do', '2026-10-13 00:00:00+09'),
  ('e0000000-0000-0000-0000-000000000012', 'MATH_EDUCATION', '사범대학', '수학교육과', '수학교육과', 'SMU_SEOUL', true, 12, 'https://www.smu.ac.kr/kor/edu/seoul01.do', '2026-10-13 00:00:00+09'),
  ('e0000000-0000-0000-0000-000000000013', 'ECONOMICS_FINANCE', '경영경제대학', '경제금융학부', '경제금융학부', 'SMU_SEOUL', true, 13, 'https://www.smu.ac.kr/kor/edu/seoul01.do', '2026-10-13 00:00:00+09'),
  ('e0000000-0000-0000-0000-000000000014', 'BUSINESS_ADMINISTRATION', '경영경제대학', '경영학부', '경영학부', 'SMU_SEOUL', true, 14, 'https://www.smu.ac.kr/kor/edu/seoul01.do', '2026-10-13 00:00:00+09'),
  ('e0000000-0000-0000-0000-000000000015', 'GLOBAL_BUSINESS', '경영경제대학', '글로벌경영학과', '글로벌경영학과', 'SMU_SEOUL', true, 15, 'https://www.smu.ac.kr/kor/edu/seoul01.do', '2026-10-13 00:00:00+09'),
  ('e0000000-0000-0000-0000-000000000016', 'CONVERGENCE_BUSINESS', '경영경제대학', '융합경영학과', '융합경영학과', 'SMU_SEOUL', true, 16, 'https://www.smu.ac.kr/kor/edu/seoul01.do', '2026-10-13 00:00:00+09'),
  ('e0000000-0000-0000-0000-000000000017', 'HUMAN_AI_ENGINEERING', '융합공과대학', '지능·데이터융합학부', '휴먼AI공학전공', 'SMU_SEOUL', true, 17, 'https://www.smu.ac.kr/kor/edu/seoul01.do', '2026-10-13 00:00:00+09'),
  ('e0000000-0000-0000-0000-000000000018', 'FINTECH', '융합공과대학', '지능·데이터융합학부', '핀테크전공', 'SMU_SEOUL', true, 18, 'https://www.smu.ac.kr/kor/edu/seoul01.do', '2026-10-13 00:00:00+09'),
  ('e0000000-0000-0000-0000-000000000019', 'BIGDATA_CONVERGENCE', '융합공과대학', '지능·데이터융합학부', '빅데이터융합전공', 'SMU_SEOUL', true, 19, 'https://www.smu.ac.kr/kor/edu/seoul01.do', '2026-10-13 00:00:00+09'),
  ('e0000000-0000-0000-0000-000000000020', 'SMART_PRODUCTION', '융합공과대학', '지능·데이터융합학부', '스마트생산전공', 'SMU_SEOUL', true, 20, 'https://www.smu.ac.kr/kor/edu/seoul01.do', '2026-10-13 00:00:00+09'),
  ('e0000000-0000-0000-0000-000000000021', 'COMPUTER_SCIENCE', '융합공과대학', 'SW융합학부', '컴퓨터과학전공', 'SMU_SEOUL', true, 21, 'https://www.smu.ac.kr/kor/edu/seoul01.do', '2026-10-13 00:00:00+09'),
  ('e0000000-0000-0000-0000-000000000022', 'ELECTRICAL_ENGINEERING', '융합공과대학', 'SW융합학부', '전기공학전공', 'SMU_SEOUL', true, 22, 'https://www.smu.ac.kr/kor/edu/seoul01.do', '2026-10-13 00:00:00+09'),
  ('e0000000-0000-0000-0000-000000000023', 'INTELLIGENT_IOT', '융합공과대학', 'SW융합학부', '지능IOT융합전공', 'SMU_SEOUL', true, 23, 'https://www.smu.ac.kr/kor/edu/seoul01.do', '2026-10-13 00:00:00+09'),
  ('e0000000-0000-0000-0000-000000000024', 'GAME', '융합공과대학', 'SW융합학부', '게임전공', 'SMU_SEOUL', true, 24, 'https://www.smu.ac.kr/kor/edu/seoul01.do', '2026-10-13 00:00:00+09'),
  ('e0000000-0000-0000-0000-000000000025', 'ANIMATION', '융합공과대학', 'SW융합학부', '애니메이션전공', 'SMU_SEOUL', true, 25, 'https://www.smu.ac.kr/kor/edu/seoul01.do', '2026-10-13 00:00:00+09'),
  ('e0000000-0000-0000-0000-000000000026', 'BIOTECHNOLOGY', '융합공과대학', '생명화학공학부', '생명공학전공', 'SMU_SEOUL', true, 26, 'https://www.smu.ac.kr/kor/edu/seoul01.do', '2026-10-13 00:00:00+09'),
  ('e0000000-0000-0000-0000-000000000027', 'CHEMICAL_ENERGY_ENGINEERING', '융합공과대학', '생명화학공학부', '화학에너지공학전공', 'SMU_SEOUL', true, 27, 'https://www.smu.ac.kr/kor/edu/seoul01.do', '2026-10-13 00:00:00+09'),
  ('e0000000-0000-0000-0000-000000000028', 'CHEMICAL_NEW_MATERIALS', '융합공과대학', '생명화학공학부', '화공신소재전공', 'SMU_SEOUL', true, 28, 'https://www.smu.ac.kr/kor/edu/seoul01.do', '2026-10-13 00:00:00+09'),
  ('e0000000-0000-0000-0000-000000000029', 'FOOD_NUTRITION', '융합공과대학', '생명화학공학부', '식품영양학전공', 'SMU_SEOUL', true, 29, 'https://www.smu.ac.kr/kor/edu/seoul01.do', '2026-10-13 00:00:00+09'),
  ('e0000000-0000-0000-0000-000000000030', 'CLOTHING', '문화예술대학', '의류학과', '의류학과', 'SMU_SEOUL', true, 30, 'https://www.smu.ac.kr/kor/edu/seoul01.do', '2026-10-13 00:00:00+09'),
  ('e0000000-0000-0000-0000-000000000031', 'SPORTS_HEALTH', '문화예술대학', '스포츠무용학부', '스포츠건강관리전공', 'SMU_SEOUL', true, 31, 'https://www.smu.ac.kr/kor/edu/seoul01.do', '2026-10-13 00:00:00+09'),
  ('e0000000-0000-0000-0000-000000000032', 'DANCE_ART', '문화예술대학', '스포츠무용학부', '무용예술전공', 'SMU_SEOUL', true, 32, 'https://www.smu.ac.kr/kor/edu/seoul01.do', '2026-10-13 00:00:00+09'),
  ('e0000000-0000-0000-0000-000000000033', 'PLASTIC_ART', '문화예술대학', '미술학부', '조형예술전공', 'SMU_SEOUL', true, 33, 'https://www.smu.ac.kr/kor/edu/seoul01.do', '2026-10-13 00:00:00+09'),
  ('e0000000-0000-0000-0000-000000000034', 'LIFE_ART', '문화예술대학', '미술학부', '생활예술전공', 'SMU_SEOUL', true, 34, 'https://www.smu.ac.kr/kor/edu/seoul01.do', '2026-10-13 00:00:00+09'),
  ('e0000000-0000-0000-0000-000000000035', 'MUSIC', '문화예술대학', '음악학부', '음악학부', 'SMU_SEOUL', true, 35, 'https://www.smu.ac.kr/kor/edu/seoul01.do', '2026-10-13 00:00:00+09')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 3. major_field_weights: 전공 -> 서비스 분야 연결표 (원 가이드라인 8.3, mapping_version v1)
-- ---------------------------------------------------------------------------
create table public.major_field_weights (
  id uuid primary key default gen_random_uuid(),
  major_id uuid not null references public.majors (id) on delete cascade,
  interest_id uuid not null references public.interests (id) on delete cascade,
  weight numeric not null check (weight in (1.0, 0.5)),
  mapping_version text not null default 'v1',
  reason text,
  created_at timestamptz not null default now(),
  unique (major_id, interest_id, mapping_version)
);

comment on table public.major_field_weights is
  '전공별 분야 연결 가중치. 학교가 정한 진로·지원 자격이 아니라 프로젝트 초기 추천 규칙(원 가이드라인 8.3).';

create index major_field_weights_major_id_idx on public.major_field_weights (major_id);
create index major_field_weights_interest_id_idx on public.major_field_weights (interest_id);

alter table public.major_field_weights enable row level security;

create policy major_field_weights_select on public.major_field_weights for select using (true);
create policy major_field_weights_write_insert on public.major_field_weights for insert with check (public.is_admin());
create policy major_field_weights_write_update on public.major_field_weights for update using (public.is_admin()) with check (public.is_admin());
create policy major_field_weights_write_delete on public.major_field_weights for delete using (public.is_admin());

-- major_id/interest_id를 동적으로 조회하는 JOIN·반복문 기반 INSERT는 (실측 결과) 일부 행이
-- 누락되는 현상이 있었다 — 위에서 직접 고정한 리터럴 UUID로 바로 값을 채워 그 경로를 피한다.
insert into public.major_field_weights (major_id, interest_id, weight, mapping_version) values
  ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000008', 1.0, 'v1'), -- HISTORY_CONTENT -> HUMANITIES_CULTURE
  ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000005', 0.5, 'v1'), -- HISTORY_CONTENT -> DESIGN_MEDIA
  ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', 0.5, 'v1'), -- HISTORY_CONTENT -> EDUCATION
  ('e0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000008', 1.0, 'v1'), -- KOREA_JAPAN_CULTURE -> HUMANITIES_CULTURE
  ('e0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000005', 0.5, 'v1'), -- KOREA_JAPAN_CULTURE -> DESIGN_MEDIA
  ('e0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000003', 0.5, 'v1'), -- KOREA_JAPAN_CULTURE -> EDUCATION
  ('e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000009', 1.0, 'v1'), -- IP_LAW -> LAW_POLICY
  ('e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000004', 0.5, 'v1'), -- IP_LAW -> BUSINESS_FINANCE
  ('e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000008', 0.5, 'v1'), -- IP_LAW -> HUMANITIES_CULTURE
  ('e0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000008', 1.0, 'v1'), -- LIBRARY_INFO -> HUMANITIES_CULTURE
  ('e0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 0.5, 'v1'), -- LIBRARY_INFO -> IT_DATA
  ('e0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003', 0.5, 'v1'), -- LIBRARY_INFO -> EDUCATION
  ('e0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001', 1.0, 'v1'), -- SPATIAL_ENVIRONMENT -> ENERGY_ENVIRONMENT
  ('e0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000009', 0.5, 'v1'), -- SPATIAL_ENVIRONMENT -> LAW_POLICY
  ('e0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000006', 0.5, 'v1'), -- SPATIAL_ENVIRONMENT -> SOCIAL_WELFARE
  ('e0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000009', 1.0, 'v1'), -- PUBLIC_ADMINISTRATION -> LAW_POLICY
  ('e0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000006', 0.5, 'v1'), -- PUBLIC_ADMINISTRATION -> SOCIAL_WELFARE
  ('e0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000002', 0.5, 'v1'), -- PUBLIC_ADMINISTRATION -> IT_DATA
  ('e0000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000009', 1.0, 'v1'), -- NATIONAL_SECURITY -> LAW_POLICY
  ('e0000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000006', 0.5, 'v1'), -- NATIONAL_SECURITY -> SOCIAL_WELFARE
  ('e0000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000002', 0.5, 'v1'), -- NATIONAL_SECURITY -> IT_DATA
  ('e0000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000006', 1.0, 'v1'), -- FAMILY_WELFARE -> SOCIAL_WELFARE
  ('e0000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000003', 0.5, 'v1'), -- FAMILY_WELFARE -> EDUCATION
  ('e0000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000010', 0.5, 'v1'), -- FAMILY_WELFARE -> BIO_FOOD_HEALTH
  ('e0000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000003', 1.0, 'v1'), -- KOREAN_EDUCATION -> EDUCATION
  ('e0000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000008', 0.5, 'v1'), -- KOREAN_EDUCATION -> HUMANITIES_CULTURE
  ('e0000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000005', 0.5, 'v1'), -- KOREAN_EDUCATION -> DESIGN_MEDIA
  ('e0000000-0000-0000-0000-000000000010', 'c0000000-0000-0000-0000-000000000003', 1.0, 'v1'), -- ENGLISH_EDUCATION -> EDUCATION
  ('e0000000-0000-0000-0000-000000000010', 'c0000000-0000-0000-0000-000000000008', 0.5, 'v1'), -- ENGLISH_EDUCATION -> HUMANITIES_CULTURE
  ('e0000000-0000-0000-0000-000000000010', 'c0000000-0000-0000-0000-000000000005', 0.5, 'v1'), -- ENGLISH_EDUCATION -> DESIGN_MEDIA
  ('e0000000-0000-0000-0000-000000000011', 'c0000000-0000-0000-0000-000000000003', 1.0, 'v1'), -- EDUCATION_STUDIES -> EDUCATION
  ('e0000000-0000-0000-0000-000000000011', 'c0000000-0000-0000-0000-000000000006', 0.5, 'v1'), -- EDUCATION_STUDIES -> SOCIAL_WELFARE
  ('e0000000-0000-0000-0000-000000000011', 'c0000000-0000-0000-0000-000000000002', 0.5, 'v1'), -- EDUCATION_STUDIES -> IT_DATA
  ('e0000000-0000-0000-0000-000000000012', 'c0000000-0000-0000-0000-000000000003', 1.0, 'v1'), -- MATH_EDUCATION -> EDUCATION
  ('e0000000-0000-0000-0000-000000000012', 'c0000000-0000-0000-0000-000000000002', 0.5, 'v1'), -- MATH_EDUCATION -> IT_DATA
  ('e0000000-0000-0000-0000-000000000013', 'c0000000-0000-0000-0000-000000000004', 1.0, 'v1'), -- ECONOMICS_FINANCE -> BUSINESS_FINANCE
  ('e0000000-0000-0000-0000-000000000013', 'c0000000-0000-0000-0000-000000000002', 0.5, 'v1'), -- ECONOMICS_FINANCE -> IT_DATA
  ('e0000000-0000-0000-0000-000000000013', 'c0000000-0000-0000-0000-000000000009', 0.5, 'v1'), -- ECONOMICS_FINANCE -> LAW_POLICY
  ('e0000000-0000-0000-0000-000000000014', 'c0000000-0000-0000-0000-000000000004', 1.0, 'v1'), -- BUSINESS_ADMINISTRATION -> BUSINESS_FINANCE
  ('e0000000-0000-0000-0000-000000000014', 'c0000000-0000-0000-0000-000000000002', 0.5, 'v1'), -- BUSINESS_ADMINISTRATION -> IT_DATA
  ('e0000000-0000-0000-0000-000000000014', 'c0000000-0000-0000-0000-000000000009', 0.5, 'v1'), -- BUSINESS_ADMINISTRATION -> LAW_POLICY
  ('e0000000-0000-0000-0000-000000000015', 'c0000000-0000-0000-0000-000000000004', 1.0, 'v1'), -- GLOBAL_BUSINESS -> BUSINESS_FINANCE
  ('e0000000-0000-0000-0000-000000000015', 'c0000000-0000-0000-0000-000000000002', 0.5, 'v1'), -- GLOBAL_BUSINESS -> IT_DATA
  ('e0000000-0000-0000-0000-000000000015', 'c0000000-0000-0000-0000-000000000009', 0.5, 'v1'), -- GLOBAL_BUSINESS -> LAW_POLICY
  ('e0000000-0000-0000-0000-000000000016', 'c0000000-0000-0000-0000-000000000004', 1.0, 'v1'), -- CONVERGENCE_BUSINESS -> BUSINESS_FINANCE
  ('e0000000-0000-0000-0000-000000000016', 'c0000000-0000-0000-0000-000000000002', 0.5, 'v1'), -- CONVERGENCE_BUSINESS -> IT_DATA
  ('e0000000-0000-0000-0000-000000000016', 'c0000000-0000-0000-0000-000000000009', 0.5, 'v1'), -- CONVERGENCE_BUSINESS -> LAW_POLICY
  ('e0000000-0000-0000-0000-000000000017', 'c0000000-0000-0000-0000-000000000002', 1.0, 'v1'), -- HUMAN_AI_ENGINEERING -> IT_DATA
  ('e0000000-0000-0000-0000-000000000017', 'c0000000-0000-0000-0000-000000000007', 0.5, 'v1'), -- HUMAN_AI_ENGINEERING -> ENGINEERING
  ('e0000000-0000-0000-0000-000000000017', 'c0000000-0000-0000-0000-000000000005', 0.5, 'v1'), -- HUMAN_AI_ENGINEERING -> DESIGN_MEDIA
  ('e0000000-0000-0000-0000-000000000019', 'c0000000-0000-0000-0000-000000000002', 1.0, 'v1'), -- BIGDATA_CONVERGENCE -> IT_DATA
  ('e0000000-0000-0000-0000-000000000019', 'c0000000-0000-0000-0000-000000000007', 0.5, 'v1'), -- BIGDATA_CONVERGENCE -> ENGINEERING
  ('e0000000-0000-0000-0000-000000000019', 'c0000000-0000-0000-0000-000000000005', 0.5, 'v1'), -- BIGDATA_CONVERGENCE -> DESIGN_MEDIA
  ('e0000000-0000-0000-0000-000000000021', 'c0000000-0000-0000-0000-000000000002', 1.0, 'v1'), -- COMPUTER_SCIENCE -> IT_DATA
  ('e0000000-0000-0000-0000-000000000021', 'c0000000-0000-0000-0000-000000000007', 0.5, 'v1'), -- COMPUTER_SCIENCE -> ENGINEERING
  ('e0000000-0000-0000-0000-000000000021', 'c0000000-0000-0000-0000-000000000005', 0.5, 'v1'), -- COMPUTER_SCIENCE -> DESIGN_MEDIA
  ('e0000000-0000-0000-0000-000000000018', 'c0000000-0000-0000-0000-000000000002', 1.0, 'v1'), -- FINTECH -> IT_DATA
  ('e0000000-0000-0000-0000-000000000018', 'c0000000-0000-0000-0000-000000000004', 1.0, 'v1'), -- FINTECH -> BUSINESS_FINANCE
  ('e0000000-0000-0000-0000-000000000018', 'c0000000-0000-0000-0000-000000000009', 0.5, 'v1'), -- FINTECH -> LAW_POLICY
  ('e0000000-0000-0000-0000-000000000020', 'c0000000-0000-0000-0000-000000000007', 1.0, 'v1'), -- SMART_PRODUCTION -> ENGINEERING
  ('e0000000-0000-0000-0000-000000000020', 'c0000000-0000-0000-0000-000000000002', 1.0, 'v1'), -- SMART_PRODUCTION -> IT_DATA
  ('e0000000-0000-0000-0000-000000000020', 'c0000000-0000-0000-0000-000000000004', 0.5, 'v1'), -- SMART_PRODUCTION -> BUSINESS_FINANCE
  ('e0000000-0000-0000-0000-000000000022', 'c0000000-0000-0000-0000-000000000007', 1.0, 'v1'), -- ELECTRICAL_ENGINEERING -> ENGINEERING
  ('e0000000-0000-0000-0000-000000000022', 'c0000000-0000-0000-0000-000000000002', 0.5, 'v1'), -- ELECTRICAL_ENGINEERING -> IT_DATA
  ('e0000000-0000-0000-0000-000000000022', 'c0000000-0000-0000-0000-000000000001', 0.5, 'v1'), -- ELECTRICAL_ENGINEERING -> ENERGY_ENVIRONMENT
  ('e0000000-0000-0000-0000-000000000023', 'c0000000-0000-0000-0000-000000000007', 1.0, 'v1'), -- INTELLIGENT_IOT -> ENGINEERING
  ('e0000000-0000-0000-0000-000000000023', 'c0000000-0000-0000-0000-000000000002', 0.5, 'v1'), -- INTELLIGENT_IOT -> IT_DATA
  ('e0000000-0000-0000-0000-000000000023', 'c0000000-0000-0000-0000-000000000001', 0.5, 'v1'), -- INTELLIGENT_IOT -> ENERGY_ENVIRONMENT
  ('e0000000-0000-0000-0000-000000000024', 'c0000000-0000-0000-0000-000000000002', 1.0, 'v1'), -- GAME -> IT_DATA
  ('e0000000-0000-0000-0000-000000000024', 'c0000000-0000-0000-0000-000000000005', 1.0, 'v1'), -- GAME -> DESIGN_MEDIA
  ('e0000000-0000-0000-0000-000000000024', 'c0000000-0000-0000-0000-000000000011', 0.5, 'v1'), -- GAME -> ARTS_PERFORMANCE
  ('e0000000-0000-0000-0000-000000000025', 'c0000000-0000-0000-0000-000000000005', 1.0, 'v1'), -- ANIMATION -> DESIGN_MEDIA
  ('e0000000-0000-0000-0000-000000000025', 'c0000000-0000-0000-0000-000000000011', 0.5, 'v1'), -- ANIMATION -> ARTS_PERFORMANCE
  ('e0000000-0000-0000-0000-000000000025', 'c0000000-0000-0000-0000-000000000008', 0.5, 'v1'), -- ANIMATION -> HUMANITIES_CULTURE
  ('e0000000-0000-0000-0000-000000000026', 'c0000000-0000-0000-0000-000000000010', 1.0, 'v1'), -- BIOTECHNOLOGY -> BIO_FOOD_HEALTH
  ('e0000000-0000-0000-0000-000000000026', 'c0000000-0000-0000-0000-000000000001', 0.5, 'v1'), -- BIOTECHNOLOGY -> ENERGY_ENVIRONMENT
  ('e0000000-0000-0000-0000-000000000026', 'c0000000-0000-0000-0000-000000000002', 0.5, 'v1'), -- BIOTECHNOLOGY -> IT_DATA
  ('e0000000-0000-0000-0000-000000000027', 'c0000000-0000-0000-0000-000000000001', 1.0, 'v1'), -- CHEMICAL_ENERGY_ENGINEERING -> ENERGY_ENVIRONMENT
  ('e0000000-0000-0000-0000-000000000027', 'c0000000-0000-0000-0000-000000000007', 1.0, 'v1'), -- CHEMICAL_ENERGY_ENGINEERING -> ENGINEERING
  ('e0000000-0000-0000-0000-000000000027', 'c0000000-0000-0000-0000-000000000010', 0.5, 'v1'), -- CHEMICAL_ENERGY_ENGINEERING -> BIO_FOOD_HEALTH
  ('e0000000-0000-0000-0000-000000000028', 'c0000000-0000-0000-0000-000000000001', 1.0, 'v1'), -- CHEMICAL_NEW_MATERIALS -> ENERGY_ENVIRONMENT
  ('e0000000-0000-0000-0000-000000000028', 'c0000000-0000-0000-0000-000000000007', 1.0, 'v1'), -- CHEMICAL_NEW_MATERIALS -> ENGINEERING
  ('e0000000-0000-0000-0000-000000000028', 'c0000000-0000-0000-0000-000000000010', 0.5, 'v1'), -- CHEMICAL_NEW_MATERIALS -> BIO_FOOD_HEALTH
  ('e0000000-0000-0000-0000-000000000029', 'c0000000-0000-0000-0000-000000000010', 1.0, 'v1'), -- FOOD_NUTRITION -> BIO_FOOD_HEALTH
  ('e0000000-0000-0000-0000-000000000029', 'c0000000-0000-0000-0000-000000000006', 0.5, 'v1'), -- FOOD_NUTRITION -> SOCIAL_WELFARE
  ('e0000000-0000-0000-0000-000000000029', 'c0000000-0000-0000-0000-000000000004', 0.5, 'v1'), -- FOOD_NUTRITION -> BUSINESS_FINANCE
  ('e0000000-0000-0000-0000-000000000030', 'c0000000-0000-0000-0000-000000000005', 1.0, 'v1'), -- CLOTHING -> DESIGN_MEDIA
  ('e0000000-0000-0000-0000-000000000030', 'c0000000-0000-0000-0000-000000000011', 0.5, 'v1'), -- CLOTHING -> ARTS_PERFORMANCE
  ('e0000000-0000-0000-0000-000000000030', 'c0000000-0000-0000-0000-000000000004', 0.5, 'v1'), -- CLOTHING -> BUSINESS_FINANCE
  ('e0000000-0000-0000-0000-000000000031', 'c0000000-0000-0000-0000-000000000012', 1.0, 'v1'), -- SPORTS_HEALTH -> SPORTS
  ('e0000000-0000-0000-0000-000000000031', 'c0000000-0000-0000-0000-000000000010', 0.5, 'v1'), -- SPORTS_HEALTH -> BIO_FOOD_HEALTH
  ('e0000000-0000-0000-0000-000000000031', 'c0000000-0000-0000-0000-000000000003', 0.5, 'v1'), -- SPORTS_HEALTH -> EDUCATION
  ('e0000000-0000-0000-0000-000000000032', 'c0000000-0000-0000-0000-000000000011', 1.0, 'v1'), -- DANCE_ART -> ARTS_PERFORMANCE
  ('e0000000-0000-0000-0000-000000000032', 'c0000000-0000-0000-0000-000000000012', 0.5, 'v1'), -- DANCE_ART -> SPORTS
  ('e0000000-0000-0000-0000-000000000032', 'c0000000-0000-0000-0000-000000000003', 0.5, 'v1'), -- DANCE_ART -> EDUCATION
  ('e0000000-0000-0000-0000-000000000033', 'c0000000-0000-0000-0000-000000000011', 1.0, 'v1'), -- PLASTIC_ART -> ARTS_PERFORMANCE
  ('e0000000-0000-0000-0000-000000000033', 'c0000000-0000-0000-0000-000000000005', 1.0, 'v1'), -- PLASTIC_ART -> DESIGN_MEDIA
  ('e0000000-0000-0000-0000-000000000033', 'c0000000-0000-0000-0000-000000000008', 0.5, 'v1'), -- PLASTIC_ART -> HUMANITIES_CULTURE
  ('e0000000-0000-0000-0000-000000000034', 'c0000000-0000-0000-0000-000000000011', 1.0, 'v1'), -- LIFE_ART -> ARTS_PERFORMANCE
  ('e0000000-0000-0000-0000-000000000034', 'c0000000-0000-0000-0000-000000000005', 1.0, 'v1'), -- LIFE_ART -> DESIGN_MEDIA
  ('e0000000-0000-0000-0000-000000000034', 'c0000000-0000-0000-0000-000000000008', 0.5, 'v1'), -- LIFE_ART -> HUMANITIES_CULTURE
  ('e0000000-0000-0000-0000-000000000035', 'c0000000-0000-0000-0000-000000000011', 1.0, 'v1'), -- MUSIC -> ARTS_PERFORMANCE
  ('e0000000-0000-0000-0000-000000000035', 'c0000000-0000-0000-0000-000000000005', 0.5, 'v1'), -- MUSIC -> DESIGN_MEDIA
  ('e0000000-0000-0000-0000-000000000035', 'c0000000-0000-0000-0000-000000000003', 0.5, 'v1'); -- MUSIC -> EDUCATION

-- 안전장치: 모든 활성 전공이 1.0 연결을 최소 1개 갖는지 이 마이그레이션 안에서 바로 검증한다.
do $$
declare
  v_missing text;
begin
  select string_agg(m.code, ', ') into v_missing
  from public.majors m
  where m.is_active
    and not exists (
      select 1 from public.major_field_weights w
      where w.major_id = m.id and w.weight = 1.0
    );
  if v_missing is not null then
    raise exception '1.0 연결이 없는 활성 전공: %', v_missing;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. profile_majors: 복수전공/부전공 구분 + 추천 반영 여부 (가이드 3.3)
-- ---------------------------------------------------------------------------
alter table public.profile_majors
  add column kind text not null default 'primary' check (kind in ('primary', 'double', 'minor')),
  add column use_for_recommendation boolean not null default true,
  add column weight numeric check (weight is null or (weight > 0 and weight <= 1));

comment on column public.profile_majors.kind is
  '주전공(primary, 사용자당 최대 1개) / 복수전공(double) / 부전공(minor).';
comment on column public.profile_majors.weight is
  '추천 반영 전공이 여럿일 때의 비중. null=균등(기본). 가이드 3.3/4.';

create unique index profile_majors_one_primary_per_profile
  on public.profile_majors (profile_id)
  where kind = 'primary';

-- ---------------------------------------------------------------------------
-- 5. profiles: 전공 상태 + 추천 모드 (가이드 3.3)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column major_status text not null default 'not_provided'
    check (major_status in ('assigned', 'exploring', 'unlisted', 'not_provided')),
  add column recommendation_mode text not null default 'balanced'
    check (recommendation_mode in ('balanced', 'major_focus', 'interest_expand'));

comment on column public.profiles.major_status is
  'assigned(배정) / exploring(탐색 중) / unlisted(목록에 없음, 자유전공 등) / not_provided(미입력, 기본).';
comment on column public.profiles.recommendation_mode is
  '사용자가 선택하는 추천 모드. 추천 반영 전공이 없으면 recommend.ts가 no_major 모드를 대신 적용한다(G2).';

-- ---------------------------------------------------------------------------
-- 6. activities: weekly_hours (가이드 3.4, eligibility 관련 필드는 G2에서 추가)
-- ---------------------------------------------------------------------------
alter table public.activities
  add column weekly_hours smallint check (weekly_hours is null or weekly_hours >= 0);

comment on column public.activities.weekly_hours is
  '주당 예상 투입 시간(원문에 명시된 경우만). 불명확하면 null.';
