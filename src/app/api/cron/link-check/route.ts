import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkActivityLink } from "@/lib/activity-import/link-check";

/**
 * 정기 점검(4/4) — 공개 중인 활동의 원문 링크를 하루 1회 점검하는 엔드포인트. 매칭 워커
 * (`run_match_worker`)는 pg_cron이 DB 안에서 직접 실행하지만, 이 점검은 외부 호스트로 나가는
 * 실제 HTTP 요청이 필요해 Postgres 혼자서는 할 수 없다(docs/architecture.md 13-B 참고 예정).
 * 그래서 외부 스케줄러(Vercel Cron Job, OS cron, GitHub Actions scheduled workflow 등)가
 * 하루 1회 이 엔드포인트를 호출하도록 등록한다 — "서버 스케줄"이라는 요구사항은 지키지만
 * pg_cron이 아닌 HTTP 트리거로 구현했다는 점이 매칭 워커와 다르다.
 *
 * `CRON_SECRET` 환경변수가 없으면 모든 요청을 거부한다(기본값이 "닫힘"). 호출자는
 * `Authorization: Bearer <CRON_SECRET>` 헤더 또는 `?secret=<CRON_SECRET>` 쿼리로 인증한다.
 */

const BATCH_SIZE = 20;
const MAX_BATCHES = 10; // 한 번 호출에 최대 200건까지(서버리스 실행 시간 한도를 고려한 상한).

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  const query = request.nextUrl.searchParams.get("secret");
  return query === secret;
}

async function runLinkCheck() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 설정돼 있지 않습니다.");
  }
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  let checked = 0;
  let ok = 0;
  let failed = 0;
  const asOf = new Date().toISOString();

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const { data: claimed, error } = await admin.rpc("claim_activities_for_link_check", {
      p_limit: BATCH_SIZE,
      p_as_of: asOf,
    });
    if (error) throw new Error(`claim_activities_for_link_check 실패: ${error.message}`);
    if (!claimed || claimed.length === 0) break;

    for (const activity of claimed as Array<{ id: string; source_url: string; apply_end_at_evidence: string | null }>) {
      checked++;
      const result = await checkActivityLink({
        sourceUrl: activity.source_url,
        applyEndAtEvidence: activity.apply_end_at_evidence,
      });
      if (result.ok) {
        ok++;
        await admin.rpc("record_link_check_result", {
          p_activity_id: activity.id,
          p_ok: true,
          p_resolved_url: result.resolvedUrl,
        });
      } else {
        failed++;
        await admin.rpc("record_link_check_result", {
          p_activity_id: activity.id,
          p_ok: false,
          p_note: result.note,
        });
      }
    }

    if (claimed.length < BATCH_SIZE) break;
  }

  return { asOf, checked, ok, failed };
}

async function handle(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  try {
    const summary = await runLinkCheck();
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "UNKNOWN_ERROR" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
