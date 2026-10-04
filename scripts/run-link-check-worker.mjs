// 개발 중 링크 점검 워커를 즉시 실행하는 스크립트. 운영 경로는 외부 스케줄러(Vercel Cron Job
// 등)가 하루 1회 /api/cron/link-check를 호출한다 — 매칭 워커와 달리 이 점검은 실제 외부 HTTP
// 요청이 필요해 pg_cron이 직접 할 수 없으므로 Next.js 서버(이 명령으로 띄운 `npm run dev`/
// `npm run start`)가 떠 있어야 한다.
//
// 사용법: npm run worker:link-check
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
config({ path: path.join(projectRoot, ".env.local") });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";
const secret = process.env.CRON_SECRET;

if (!secret) {
  console.error("CRON_SECRET이 .env.local에 필요합니다(정기 점검 엔드포인트 인증용 — 임의의 긴 문자열).");
  process.exit(1);
}

const response = await fetch(`${siteUrl}/api/cron/link-check`, {
  method: "POST",
  headers: { authorization: `Bearer ${secret}` },
});

const body = await response.json();
if (!response.ok) {
  console.error("링크 점검 워커 실행 실패:", body);
  process.exit(1);
}

console.log("링크 점검 워커 실행 완료:");
console.log(JSON.stringify(body, null, 2));
