-- 티처블 머신 연동 보완: model_class_field_map이 비어 있으면(모델 배포 전) manifest 라벨 검사가
-- "검사할 기준이 없음"으로 건너뛰거나, 모델 버전이 바뀔 때마다 기준이 흔들리는 문제를 고친다.
-- docs/teachable-machine-integration.md 3.6, 6.2, 9장 G3/G4 범위에 대한 보완.
--
-- 설계 메모:
-- - "클래스 구성"(어떤 class_id가 유효하고 각 class_id가 어떤 서비스 분야 후보로 이어지는지)과
--   "모델 버전 연결"(실제로 배포된 모델이 그 구성과 일치하는지)을 분리한다. 전자는
--   classifier_class_sets/classifier_class_set_classes로, 둘 다 모델이 생기기 전에도 존재해야
--   하므로 마이그레이션으로 'pilot-4-v1' 구성을 직접 넣는다(시드가 아니라 마이그레이션이어야
--   운영 환경에도 들어간다).
-- - manifest 라벨 검사(6.2)는 이제 model_class_field_map이 아니라 "활성 클래스 구성"
--   (classifier_class_sets.is_active)의 class_id 집합을 기준으로 한다 — 모델이 아직 없어도
--   정상적으로 검사가 동작한다.
-- - model_class_field_map(모델 버전별 실제 연결표)은 그대로 둔다. 대신 관리자가 모델을 등록할 때
--   (register_classifier_model) 선택한 클래스 구성의 행을 그 model_version으로 복사해 채운다 —
--   그래야 새 모델 버전에도 후보 제안이 꺼지지 않는다(PROGRESS.md 참조).

-- ---------------------------------------------------------------------------
-- 1. classifier_class_sets: 클래스 구성(예: 예비 실험 4클래스). 한 번에 하나만 활성화할 수 있다.
-- ---------------------------------------------------------------------------
create table public.classifier_class_sets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.classifier_class_sets is
  '클래스 구성(가이드 3.6/6.2 보완) — 모델 버전과 무관하게 "어떤 class_id가 유효한지"를 정의한다. model_class_field_map(모델별 실제 연결표)과는 별개다.';

-- 활성 구성은 항상 하나 이하다 — 상수 표현식에 걸린 부분 유니크 인덱스로, is_active=true인 행이
-- 둘 이상이면 유니크 위반이 된다.
create unique index classifier_class_sets_single_active_idx
  on public.classifier_class_sets ((1))
  where is_active;

alter table public.classifier_class_sets enable row level security;

create policy classifier_class_sets_select on public.classifier_class_sets for select using (true);
create policy classifier_class_sets_write_insert on public.classifier_class_sets for insert with check (public.is_admin());
create policy classifier_class_sets_write_update on public.classifier_class_sets for update using (public.is_admin()) with check (public.is_admin());
create policy classifier_class_sets_write_delete on public.classifier_class_sets for delete using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. classifier_class_set_classes: 구성에 속한 class_id -> 서비스 분야 후보(가이드 3.6 표).
--    한 class_id가 여러 후보 분야로 이어질 수 있다(SOCIAL_ENVIRONMENT -> 2행).
-- ---------------------------------------------------------------------------
create table public.classifier_class_set_classes (
  id uuid primary key default gen_random_uuid(),
  class_set_id uuid not null references public.classifier_class_sets (id) on delete cascade,
  class_id text not null,
  interest_id uuid not null references public.interests (id),
  created_at timestamptz not null default now(),
  unique (class_set_id, class_id, interest_id)
);

comment on table public.classifier_class_set_classes is
  '클래스 구성에 속한 class_id와 그 후보 서비스 분야(가이드 3.6 표). manifest 라벨 검사는 이 테이블에서 class_set_id가 활성 구성인 행들의 class_id 집합을 기준으로 한다.';

create index classifier_class_set_classes_class_set_id_idx on public.classifier_class_set_classes (class_set_id);

alter table public.classifier_class_set_classes enable row level security;

create policy classifier_class_set_classes_select on public.classifier_class_set_classes for select using (true);
create policy classifier_class_set_classes_write_insert on public.classifier_class_set_classes for insert with check (public.is_admin());
create policy classifier_class_set_classes_write_update on public.classifier_class_set_classes for update using (public.is_admin()) with check (public.is_admin());
create policy classifier_class_set_classes_write_delete on public.classifier_class_set_classes for delete using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. 예비 구성 'pilot-4-v1' (가이드 3.6/7.1 예비 실험 4클래스). 마이그레이션으로 직접 넣는다 —
--    시드와 달리 운영 환경에도 적용된다.
-- ---------------------------------------------------------------------------
insert into public.classifier_class_sets (id, code, name, is_active) values
  ('f0000000-0000-0000-0000-000000000001', 'pilot-4-v1', '예비 실험 4클래스 구성', true)
on conflict (code) do nothing;

-- interests.id는 20261013010000_service_fields_and_majors.sql이 고정 UUID로 등록한 행을 그대로
-- 참조한다: IT_DATA=...002, BUSINESS_FINANCE=...004, DESIGN_MEDIA=...005, SOCIAL_WELFARE=...006,
-- ENERGY_ENVIRONMENT=...001.
insert into public.classifier_class_set_classes (class_set_id, class_id, interest_id) values
  ('f0000000-0000-0000-0000-000000000001', 'IT_DATA', 'c0000000-0000-0000-0000-000000000002'),
  ('f0000000-0000-0000-0000-000000000001', 'BUSINESS_PLANNING', 'c0000000-0000-0000-0000-000000000004'),
  ('f0000000-0000-0000-0000-000000000001', 'DESIGN_MEDIA', 'c0000000-0000-0000-0000-000000000005'),
  ('f0000000-0000-0000-0000-000000000001', 'SOCIAL_ENVIRONMENT', 'c0000000-0000-0000-0000-000000000006'),
  ('f0000000-0000-0000-0000-000000000001', 'SOCIAL_ENVIRONMENT', 'c0000000-0000-0000-0000-000000000001')
on conflict (class_set_id, class_id, interest_id) do nothing;

-- ---------------------------------------------------------------------------
-- 4. classifier_model_registrations: 실제 모델 버전이 어떤 클래스 구성으로 검증·등록됐는지,
--    언제 누가 등록했는지. model_version은 유니크 — 같은 버전 재등록은 갱신이지 중복이 아니다.
-- ---------------------------------------------------------------------------
create table public.classifier_model_registrations (
  id uuid primary key default gen_random_uuid(),
  model_version text not null unique,
  class_set_id uuid not null references public.classifier_class_sets (id),
  registered_by uuid not null references public.profiles (id),
  registered_at timestamptz not null default now()
);

comment on table public.classifier_model_registrations is
  '모델 버전 등록 기록(언제·누가·어떤 클래스 구성으로). 등록 시 register_classifier_model()이 model_class_field_map 행을 class_set에서 복사해 채운다.';

alter table public.classifier_model_registrations enable row level security;

create policy classifier_model_registrations_select on public.classifier_model_registrations for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 5. register_classifier_model: labels가 선택한 클래스 구성과 정확히 일치할 때만 등록을 허용하고,
--    등록되면 model_class_field_map을 그 구성에서 복사해 채운다(가이드 3.6 "모델 교체" 절차).
-- ---------------------------------------------------------------------------
create or replace function public.register_classifier_model(
  p_model_version text,
  p_class_set_id uuid,
  p_labels text[]
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected text[];
  v_provided text[];
  v_registration_id uuid;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: 운영자만 모델을 등록할 수 있습니다.';
  end if;
  if nullif(trim(p_model_version), '') is null then
    raise exception 'MODEL_VERSION_REQUIRED: 모델 버전이 없습니다.';
  end if;
  if not exists (select 1 from public.classifier_class_sets where id = p_class_set_id) then
    raise exception 'CLASS_SET_NOT_FOUND: 클래스 구성을 찾을 수 없습니다.';
  end if;

  select array_agg(distinct class_id order by class_id) into v_expected
    from public.classifier_class_set_classes where class_set_id = p_class_set_id;
  select array_agg(distinct x order by x) into v_provided
    from unnest(coalesce(p_labels, '{}'::text[])) x;

  if coalesce(v_expected, '{}'::text[]) <> coalesce(v_provided, '{}'::text[]) then
    raise exception 'LABELS_MISMATCH: 모델의 라벨이 선택한 클래스 구성과 일치하지 않습니다.';
  end if;

  insert into public.classifier_model_registrations (model_version, class_set_id, registered_by, registered_at)
  values (p_model_version, p_class_set_id, auth.uid(), now())
  on conflict (model_version) do update set
    class_set_id = excluded.class_set_id,
    registered_by = excluded.registered_by,
    registered_at = now()
  returning id into v_registration_id;

  -- 재등록해도 중복되지 않도록 이 모델 버전의 기존 연결표를 지우고 선택한 구성에서 다시 복사한다.
  delete from public.model_class_field_map where model_version = p_model_version;
  insert into public.model_class_field_map (model_version, class_id, interest_id)
    select p_model_version, class_id, interest_id
    from public.classifier_class_set_classes
    where class_set_id = p_class_set_id;

  return v_registration_id;
end;
$$;

revoke all on function public.register_classifier_model(text, uuid, text[]) from public, anon, authenticated;
grant execute on function public.register_classifier_model(text, uuid, text[]) to authenticated;
