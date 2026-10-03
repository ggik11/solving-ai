-- 2-B 온보딩/프로필 화면을 만들며 드러난 추가 공백(지시서 4장 전체 항목)을 메운다.

alter table public.profiles
  add column academic_status text not null default 'enrolled'
    check (academic_status in ('enrolled', 'leave_of_absence', 'graduated_pending', 'other')), -- 학년 옆 "휴학 등 상태"
  add column preferred_location_type text
    check (preferred_location_type is null or preferred_location_type in ('online', 'offline', 'hybrid')), -- 참여 조건: 온/오프/혼합
  add column preferred_region text,                 -- 참여 조건: 지역
  add column weekly_available_hours smallint
    check (weekly_available_hours is null or weekly_available_hours >= 0), -- 참여 조건: 주당 투입 가능 시간
  add column experience text,                        -- 선택 정보: 활동 경험
  add column matching_opt_in boolean not null default true,       -- 공개 설정: 매칭 참여 여부
  add column notifications_enabled boolean not null default true; -- 공개 설정: 알림 설정

-- 닉네임 중복 검증 (대소문자 구분 없이).
create unique index profiles_nickname_key on public.profiles (lower(nickname));
