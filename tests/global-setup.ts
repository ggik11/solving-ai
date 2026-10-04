import { Client } from "pg";

// matching.test.ts의 "매칭 성공 → 전원 수락 → 파티/채팅방 1개 생성" 테스트는 run_match_worker()의
// 반환값(new_proposals)을 직접 비교하는데, 이 함수는 "대기 중인 모든 (활동,템플릿) 그룹"을
// 한 번에 처리한다(architecture.md 12.3절). pg_cron이 매분 같은 함수를 백그라운드로도 호출하므로
// (20261003170100_matching_functions.sql), 테스트 실행 시각이 그 틱과 겹치면 테스트가 기대하지
// 않은 다른 그룹까지 같은 호출에서 집계되어 플레이키해진다(5단계 작업 중 실제로 재현됨).
//
// 이 전역 설정이 테스트 스위트 시작 전에 pg_cron 작업을 내려두고, 스위트가 끝나면 마이그레이션과
// 동일한 정의로 되살린다 — 로컬 Supabase의 직접 Postgres 포트(54322)에 연결해 cron.unschedule/
// cron.schedule을 호출한다(이 작업은 public 스키마 RPC로 노출하지 않는다 — 프로덕션에 테스트
// 전용 제어 함수를 남기지 않기 위해, 순수하게 테스트 하네스 안에서만 pg로 직접 처리한다).

const JOB_NAME = "match-worker";
const JOB_SCHEDULE = "* * * * *";
const JOB_COMMAND = "select public.run_match_worker(now());";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export default async function globalSetup() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await client.query("select cron.unschedule(jobid) from cron.job where jobname = $1", [JOB_NAME]);
  } finally {
    await client.end();
  }

  return async () => {
    const teardownClient = new Client({ connectionString: DB_URL });
    await teardownClient.connect();
    try {
      // 재적용 시 중복 등록되지 않도록 먼저 지운 뒤(이미 없을 수도 있음, 무해) 동일하게 재등록한다.
      await teardownClient.query("select cron.unschedule(jobid) from cron.job where jobname = $1", [JOB_NAME]);
      await teardownClient.query("select cron.schedule($1, $2, $3)", [JOB_NAME, JOB_SCHEDULE, JOB_COMMAND]);
    } finally {
      await teardownClient.end();
    }
  };
}
