-- 3단계: 추천 카드의 "숨기기"/"관심 없음" 액션을 영구 저장한다(새로고침·재로그인 후에도 유지).
-- 추천 자체(점수 계산)는 DB가 아니라 src/lib/recommend.ts(순수 함수)에서 계산하고,
-- 여기서는 사용자가 특정 활동을 추천에서 제외해달라고 명시한 사실만 보관한다.

create table public.activity_feedback (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  activity_id uuid not null references public.activities (id) on delete cascade,
  feedback text not null check (feedback in ('hidden', 'not_interested')),
  created_at timestamptz not null default now(),
  primary key (profile_id, activity_id)
);

comment on table public.activity_feedback is
  '추천 카드 "숨기기"/"관심 없음" 기록. 둘 다 해당 활동을 이후 추천 계산 대상에서 제외하는 데 쓰인다 (지시서 6장).';

alter table public.activity_feedback enable row level security;

create policy activity_feedback_select on public.activity_feedback for select
  using (profile_id = auth.uid());
create policy activity_feedback_insert on public.activity_feedback for insert
  with check (profile_id = auth.uid());
create policy activity_feedback_update on public.activity_feedback for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
create policy activity_feedback_delete on public.activity_feedback for delete
  using (profile_id = auth.uid());
