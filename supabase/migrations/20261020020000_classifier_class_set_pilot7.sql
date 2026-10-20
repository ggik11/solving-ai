-- 티처블 머신 연동: 파일럿 클래스 구성을 7개로 확장(pilot-7-v1). 기존 pilot-4-v1/pilot-6-v1
-- 마이그레이션(20261013060000/20261020010000)은 수정하지 않고 그대로 둔다 — 두 구성 모두
-- 지우지 않고 비활성으로만 둔다(이미 그 구성으로 등록된 모델 버전이 있다면 model_class_field_map
-- 참조가 깨지지 않는다). docs/teachable-machine-integration.md 3.6/7.1/7.3 보완.
--
-- 설계 메모:
-- - interest_id가 null인 행(CAMPUS_NOTICE처럼 "서비스 분야 없음"을 의도적으로 표시하는 행)이
--   같은 (class_set_id, class_id)에 중복으로 쌓이는 것을 막기 위해, 두 테이블의 유니크 제약을
--   NULLS NOT DISTINCT로 바꾼다(PostgreSQL 15+, 이 저장소는 17). 기존에는 표준 NULL 비교
--   규칙상 null 행끼리는 유니크 위반으로 잡히지 않아 "not exists" 가드로 우회했었다
--   (20261020010000의 CAMPUS_NOTICE 삽입 참고). 이제는 on conflict ... do nothing이 null 행에도
--   정상 동작해, 이번 마이그레이션의 CAMPUS_NOTICE 삽입도 다른 행과 같은 방식으로 쓸 수 있다.
-- - 이번 구성부터는 class_id -> interest_id를 하드코딩 UUID 대신 interests.code로 서브쿼리해
--   찾는다 — 코드 값만 맞으면 되므로 더 읽기 쉽고, 다른 마이그레이션이 고정한 UUID 값을 외우지
--   않아도 된다. 서브쿼리가 아무 것도 찾지 못하면(코드 오타) null이 조용히 들어갈 수 있으므로,
--   맨 끝에서 "CAMPUS_NOTICE를 제외하고 interest_id가 null인 행이 없는지"를 직접 검증한다.

-- ---------------------------------------------------------------------------
-- 1. 유니크 제약을 NULLS NOT DISTINCT로 보강(가이드 3.6 보완).
-- ---------------------------------------------------------------------------
alter table public.classifier_class_set_classes
  drop constraint classifier_class_set_classes_class_set_id_class_id_interest_key;
alter table public.classifier_class_set_classes
  add constraint classifier_class_set_classes_class_set_id_class_id_interest_key
  unique nulls not distinct (class_set_id, class_id, interest_id);

alter table public.model_class_field_map
  drop constraint model_class_field_map_model_version_class_id_interest_id_key;
alter table public.model_class_field_map
  add constraint model_class_field_map_model_version_class_id_interest_id_key
  unique nulls not distinct (model_version, class_id, interest_id);

-- ---------------------------------------------------------------------------
-- 2. 파일럿 구성을 pilot-6-v1 -> pilot-7-v1로 전환(가이드 7.1/7.3). pilot-4-v1/pilot-6-v1은
--    지우지 않고 비활성으로만 둔다.
-- ---------------------------------------------------------------------------
update public.classifier_class_sets set is_active = false where code in ('pilot-4-v1', 'pilot-6-v1');

insert into public.classifier_class_sets (id, code, name, is_active) values
  ('f0000000-0000-0000-0000-000000000003', 'pilot-7-v1', '예비 실험 7클래스 구성', true)
on conflict (code) do nothing;

-- class_id -> 서비스 분야 후보(가이드 3.6 보완 표). CAMPUS_NOTICE는 분야가 없으므로 이 목록에는
-- 넣지 않고 아래에서 따로 null로 삽입한다.
insert into public.classifier_class_set_classes (class_set_id, class_id, interest_id)
select 'f0000000-0000-0000-0000-000000000003', m.class_id, (select id from public.interests where code = m.interest_code)
from (values
  ('IT_ENGINEERING', 'IT_DATA'),
  ('IT_ENGINEERING', 'ENGINEERING'),
  ('BUSINESS_PLANNING', 'BUSINESS_FINANCE'),
  ('DESIGN_MEDIA', 'DESIGN_MEDIA'),
  ('DESIGN_MEDIA', 'ARTS_PERFORMANCE'),
  ('SOCIAL_ENVIRONMENT', 'SOCIAL_WELFARE'),
  ('SOCIAL_ENVIRONMENT', 'ENERGY_ENVIRONMENT'),
  ('LAW_POLICY', 'LAW_POLICY'),
  ('HOBBY_CULTURE', 'SPORTS'),
  ('HOBBY_CULTURE', 'ARTS_PERFORMANCE'),
  ('HOBBY_CULTURE', 'HUMANITIES_CULTURE')
) as m(class_id, interest_code)
on conflict (class_set_id, class_id, interest_id) do nothing;

-- CAMPUS_NOTICE: 서비스 분야 없음(의도적 null, 가이드 3.6 보완 — 기존 pilot-6-v1과 같은 처리).
insert into public.classifier_class_set_classes (class_set_id, class_id, interest_id) values
  ('f0000000-0000-0000-0000-000000000003', 'CAMPUS_NOTICE', null)
on conflict (class_set_id, class_id, interest_id) do nothing;

-- 안전장치: interests.code 서브쿼리가 조용히 null을 반환하지 않았는지(코드 오타 등) 검증한다 —
-- CAMPUS_NOTICE만 의도적으로 null이어야 한다.
do $$
declare
  v_missing text;
begin
  select string_agg(class_id, ', ') into v_missing
  from public.classifier_class_set_classes
  where class_set_id = 'f0000000-0000-0000-0000-000000000003'
    and class_id <> 'CAMPUS_NOTICE'
    and interest_id is null;
  if v_missing is not null then
    raise exception 'pilot-7-v1 구성에서 interest_id를 찾지 못한 class_id가 있습니다(interests.code 오타 의심): %', v_missing;
  end if;
end $$;
