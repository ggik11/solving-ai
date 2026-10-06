-- 코드 검수(비효율): match_proposal_members.queue_id(마이그레이션 20261004040000에서
-- on delete cascade로 바뀐 컬럼)에 인덱스가 없었다. 이 컬럼은
--   (1) _cancel_matching_queue_for_activity(20261003170100)와
--       /match/[activityId] 페이지(renderProposalPanel)에서 직접 where queue_id = ...로
--       조회되고,
--   (2) on delete cascade FK의 대상이라 matching_queue 행이 삭제될 때마다(활동 삭제 등)
--       Postgres가 이 테이블에서 자식 행을 찾기 위해 스캔한다.
-- 순수 추가라 기존 동작·RLS·보안 가드에는 영향이 없다.
create index if not exists match_proposal_members_queue_id_idx
  on public.match_proposal_members (queue_id);
