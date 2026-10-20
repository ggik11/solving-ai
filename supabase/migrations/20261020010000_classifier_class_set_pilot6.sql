-- 티처블 머신 연동: 파일럿 클래스 구성을 4개에서 6개로 확장(pilot-6-v1). 기존 'pilot-4-v1'
-- 마이그레이션(20261013060000)은 수정하지 않고 그대로 둔다 — pilot-4-v1 구성 자체도 지우지
-- 않는다(이미 그 구성으로 등록된 모델 버전이 있다면 model_class_field_map 참조가 깨지지 않는다).
-- docs/teachable-machine-integration.md 3.6/7.1/7.3 보완.
--
-- 설계 메모:
-- - CAMPUS_NOTICE(교내 행정 공지)는 서비스 분야가 없는 클래스다. classifier_class_set_classes/
--   model_class_field_map의 interest_id를 "의도적으로 비움(null)"으로 표시해, "아직 매핑을
--   못 채운 버그"와 "원래 서비스 분야가 없는 클래스"를 구분한다. 이를 위해 두 테이블의
--   interest_id를 nullable로 바꾼다 — 기존 행은 전부 interest_id가 있으므로 영향이 없다.
-- - 판정 로직(src/lib/poster/classifier.ts, analyze.ts)은 model_class_field_map에서 topClass에
--   해당하는 행이 있고 그 interest_id가 전부 null이면 "서비스 분야 없음 클래스"로 보고, 점수가
--   임계값을 넘어도 suggested로 올리지 않고 needs_review로 둔다.
-- - pilot-6-v1을 새 활성 구성으로 전환하고 pilot-4-v1은 비활성으로 남긴다.

-- ---------------------------------------------------------------------------
-- 1. interest_id를 nullable로: "서비스 분야 없음"을 명시하는 클래스(CAMPUS_NOTICE)를 표현한다.
-- ---------------------------------------------------------------------------
alter table public.classifier_class_set_classes alter column interest_id drop not null;
alter table public.model_class_field_map alter column interest_id drop not null;

comment on column public.classifier_class_set_classes.interest_id is
  '이 class_id가 이어지는 서비스 분야 후보. null이면 "서비스 분야 없음"을 의도적으로 표시한 것이다(가이드 3.6 보완, 예: CAMPUS_NOTICE).';
comment on column public.model_class_field_map.interest_id is
  '모델 클래스가 이어지는 서비스 분야 후보. null이면 "서비스 분야 없음"을 의도적으로 표시한 것이다(가이드 3.6 보완, 예: CAMPUS_NOTICE) — 이 클래스가 1위여도 분야를 제안하지 않고 needs_review로 둔다.';

-- ---------------------------------------------------------------------------
-- 2. 파일럿 구성을 pilot-4-v1 -> pilot-6-v1로 전환(가이드 7.1/7.3). pilot-4-v1은 지우지 않고
--    비활성으로만 남긴다.
-- ---------------------------------------------------------------------------
update public.classifier_class_sets set is_active = false where code = 'pilot-4-v1';

insert into public.classifier_class_sets (id, code, name, is_active) values
  ('f0000000-0000-0000-0000-000000000002', 'pilot-6-v1', '예비 실험 6클래스 구성', true)
on conflict (code) do nothing;

-- interests.id (20261013010000_service_fields_and_majors.sql이 고정 UUID로 등록한 행을 그대로
-- 참조한다): IT_DATA=...002, ENGINEERING=...007, BUSINESS_FINANCE=...004, DESIGN_MEDIA=...005,
-- SOCIAL_WELFARE=...006, ENERGY_ENVIRONMENT=...001, LAW_POLICY=...009.
insert into public.classifier_class_set_classes (class_set_id, class_id, interest_id) values
  ('f0000000-0000-0000-0000-000000000002', 'IT_ENGINEERING', 'c0000000-0000-0000-0000-000000000002'),
  ('f0000000-0000-0000-0000-000000000002', 'IT_ENGINEERING', 'c0000000-0000-0000-0000-000000000007'),
  ('f0000000-0000-0000-0000-000000000002', 'BUSINESS_PLANNING', 'c0000000-0000-0000-0000-000000000004'),
  ('f0000000-0000-0000-0000-000000000002', 'DESIGN_MEDIA', 'c0000000-0000-0000-0000-000000000005'),
  ('f0000000-0000-0000-0000-000000000002', 'SOCIAL_ENVIRONMENT', 'c0000000-0000-0000-0000-000000000006'),
  ('f0000000-0000-0000-0000-000000000002', 'SOCIAL_ENVIRONMENT', 'c0000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000002', 'LAW_POLICY', 'c0000000-0000-0000-0000-000000000009')
on conflict (class_set_id, class_id, interest_id) do nothing;

-- CAMPUS_NOTICE: 서비스 분야 없음(의도적 null). "on conflict (class_set_id, class_id,
-- interest_id)"는 interest_id가 null이면 표준 NULL 비교 규칙상 기존 null 행과의 중복을 유니크
-- 인덱스가 판정하지 못하므로(재실행 시 중복 삽입 위험), not exists로 직접 멱등성을 보장한다.
insert into public.classifier_class_set_classes (class_set_id, class_id, interest_id)
select 'f0000000-0000-0000-0000-000000000002', 'CAMPUS_NOTICE', null
where not exists (
  select 1 from public.classifier_class_set_classes
  where class_set_id = 'f0000000-0000-0000-0000-000000000002'
    and class_id = 'CAMPUS_NOTICE'
    and interest_id is null
);
