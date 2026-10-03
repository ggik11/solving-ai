-- Extensions
create extension if not exists pgcrypto with schema extensions;

-- Generic updated_at maintenance
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- is_admin()은 user_roles 테이블이 생긴 뒤인 20261003120100_reference_and_settings.sql 끝에서 정의한다
-- (language sql 함수는 plpgsql과 달리 CREATE 시점에 참조 릴레이션 존재 여부를 검사한다).
