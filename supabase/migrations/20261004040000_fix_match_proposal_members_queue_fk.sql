-- 버그 수정: match_proposal_members.queue_id가 matching_queue(id)를 ON DELETE 절 없이(기본
-- NO ACTION) 참조하고 있었다. activities 삭제는 matching_queue와 match_proposals 양쪽으로
-- CASCADE되는데, match_proposals → match_proposal_members는 CASCADE인 반면 그 행이 가리키는
-- matching_queue 행 자체는 이 FK가 막아서, 같은 삭제 문 안에서 두 CASCADE 경로의 처리 순서에
-- 따라 "matching_queue violates foreign key constraint match_proposal_members_queue_id_fkey"
-- 오류로 삭제 전체가 조용히 실패할 수 있었다(제안이 1건이라도 걸린 활동이면 거의 항상 재현).
--
-- 실제 영향: 운영자가 빠른 매칭 제안이 있었던 활동을 삭제하려 하면 실패한다. 5단계 작업 중
-- 테스트가 매번 만드는 활동을 정리하는 deleteActivity() 헬퍼들이 에러를 확인하지 않아 이 실패를
-- 조용히 삼켰고, "탈락한 후보"(정원에 못 든 대기자)의 matching_queue 행이 활동과 함께 지워지지
-- 않고 waiting 상태로 남아 다음 워커 실행 때마다 다시 집계되면서
-- tests/rls/matching.test.ts의 new_proposals 전역 카운트 단언이 흔들렸다(5단계 "지운 테스트
-- 단언 복구" 작업 중 실제로 추적해 발견).
--
-- 수정: queue_id FK에 ON DELETE CASCADE를 추가한다 — matching_queue 행이 삭제되면(활동 삭제로
-- 인한 CASCADE든, 다른 이유든) 그 행을 가리키던 match_proposal_members 행도 함께 삭제되는 것이
-- 맞다(어차피 match_proposals 경로로도 같은 트랜잭션에서 지워지는 행이다 — 이번 수정은 두
-- CASCADE 경로의 순서에 의존하지 않도록 만든다).
alter table public.match_proposal_members
  drop constraint match_proposal_members_queue_id_fkey,
  add constraint match_proposal_members_queue_id_fkey
    foreign key (queue_id) references public.matching_queue (id) on delete cascade;
