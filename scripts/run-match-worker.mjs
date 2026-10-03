// 개발 중 매칭 워커를 즉시 실행하는 스크립트. 운영 경로는 pg_cron이 매분 자동으로
// `select public.run_match_worker(now())`를 호출한다(마이그레이션 20261003170100 참고) —
// 이 스크립트는 그 사이를 기다리지 않고 바로 확인하고 싶을 때 쓴다.
//
// 사용법: npm run worker:match [기준시각 ISO문자열]
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
config({ path: path.join(projectRoot, ".env.local") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 .env.local에 필요합니다 (supabase start 출력 참고).");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const asOf = process.argv[2] ?? new Date().toISOString();
const { data, error } = await admin.rpc("run_match_worker", { p_as_of: asOf });

if (error) {
  console.error("매칭 워커 실행 실패:", error.message);
  process.exit(1);
}

console.log(`매칭 워커 실행 완료 (기준 시각: ${asOf})`);
console.log(JSON.stringify(data, null, 2));
