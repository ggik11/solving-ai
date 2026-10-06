-- 코드 검수(비효율): matching_queue에 (status, activity_id, template_id) 복합 인덱스가 없었다.
-- run_match_worker()가 pg_cron으로 매분 자동 실행되며, 그 안에서
--   (a) select distinct activity_id, template_id from matching_queue where status = 'waiting'
--   (b) _find_match_for_group의 ... where activity_id = ... and template_id = ... and status = 'waiting'
-- 두 쿼리를 매번 이 조합으로 스캔한다 — 1회성 페이지 조회가 아니라 상시 반복 실행되는
-- 워크로드다. /match/[activityId] 대기 화면(WaitingPanel)의
-- eq("activity_id", ...).eq("template_id", ...).eq("status", "waiting") 조회도 같은 인덱스로
-- 이득을 본다. 순수 추가라 기존 동작·RLS·보안 가드에는 영향이 없다.
create index if not exists matching_queue_status_activity_template_idx
  on public.matching_queue (status, activity_id, template_id);
