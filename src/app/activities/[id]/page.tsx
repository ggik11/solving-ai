import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/PageContainer";
import { EmptyState } from "@/components/states";
import { Badge } from "@/components/Badge";
import { BookmarkButton } from "@/components/BookmarkButton";
import { loadRecommendationForActivity } from "@/lib/recommendations/query";
import { formatKst, getApplyPhase, needsSourceVerification, APPLY_PHASE_LABEL } from "@/lib/format";
import { PARTY_STATUS_LABEL, partyStatusBadgeVariant } from "@/lib/party";
import { blockedCounterpartIds, filterPartiesExcludingBlocked, type BlockRow } from "@/lib/blocks";
import { isHttpUrl } from "@/lib/url";
import type { ActivityWithType } from "@/lib/supabase/types";

interface ActivityPartyRow {
  id: string;
  title: string | null;
  status: string;
  capacity: number;
  party_members: { profile_id: string; status: string }[];
}

const LOCATION_LABEL: Record<string, string> = { online: "온라인", offline: "오프라인", hybrid: "혼합" };
const PARTICIPATION_LABEL: Record<string, string> = { solo: "개인 참여", team: "팀 참여", both: "개인·팀 모두 가능" };

export default async function ActivityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: activity, error } = await supabase
    .from("activities")
    .select("*, activity_types(id, name)")
    .eq("id", id)
    .maybeSingle<ActivityWithType>();

  if (error || !activity) {
    notFound();
  }

  const { data: tags } = await supabase.from("activity_tags").select("tag").eq("activity_id", id);
  const tagNames = (tags ?? []).map((t) => t.tag);

  const { data: userData } = await supabase.auth.getUser();
  const [recommendation, bookmarkRes, partiesRes, blocksRes] = userData.user
    ? await Promise.all([
        loadRecommendationForActivity(supabase, userData.user.id, activity, tagNames),
        supabase
          .from("bookmarks")
          .select("activity_id")
          .eq("profile_id", userData.user.id)
          .eq("activity_id", id)
          .maybeSingle(),
        supabase
          .from("parties")
          .select("id, title, status, capacity, party_members(profile_id, status)")
          .eq("activity_id", id)
          .eq("source", "manual")
          .in("status", ["recruiting", "full", "confirmed"])
          .order("created_at", { ascending: false })
          .returns<ActivityPartyRow[]>(),
        supabase
          .from("blocks")
          .select("blocker_id, blocked_id")
          .or(`blocker_id.eq.${userData.user.id},blocked_id.eq.${userData.user.id}`)
          .returns<BlockRow[]>(),
      ])
    : [null, { data: null }, { data: null }, { data: null }];
  const isBookmarked = Boolean(bookmarkRes.data);
  const blockedIds = userData.user ? blockedCounterpartIds(userData.user.id, blocksRes.data ?? []) : new Set<string>();
  // 차단한(또는 차단당한) 사용자가 활성 멤버인 파티는 "관련 파티"에서 제외한다
  // (지시서 8장 "차단한 두 사용자는 새 파티 추천...에서 제외").
  const visibleParties = filterPartiesExcludingBlocked(partiesRes.data ?? [], blockedIds);
  const relatedParties = visibleParties.map((p) => ({
    ...p,
    activeMemberCount: p.party_members.filter((m) => m.status === "active").length,
  }));

  const phase = getApplyPhase(activity.apply_start_at, activity.apply_end_at);
  const needsVerification = needsSourceVerification(activity.last_verified_at);

  return (
    <PageContainer>
      <Link href="/activities" className="mb-3 inline-block text-sm text-[var(--color-brand-700)] underline">
        ← 활동 탐색으로
      </Link>

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {activity.is_demo && <Badge variant="neutral">데모 데이터</Badge>}
        {needsVerification && <Badge variant="warning">원문 확인 필요</Badge>}
        <Badge variant={phase === "closing_soon" ? "warning" : phase === "closed" ? "neutral" : "info"}>
          {APPLY_PHASE_LABEL[phase]}
        </Badge>
      </div>

      <div className="mb-1 flex items-start justify-between gap-2">
        <h1 className="text-xl font-semibold">{activity.title}</h1>
        {userData.user && <BookmarkButton activityId={id} initialBookmarked={isBookmarked} />}
      </div>
      {activity.summary && <p className="mb-4 text-sm text-[var(--color-muted-foreground)]">{activity.summary}</p>}

      <section className="mb-4 flex flex-col gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm">
        <Row label="주최기관" value={activity.org_name ?? "미정"} />
        <Row label="유형" value={activity.activity_types?.name ?? "미분류"} />
        <Row label="진행 방식" value={`${LOCATION_LABEL[activity.location_type]}${activity.region ? ` · ${activity.region}` : ""}`} />
        <Row label="참여 형태" value={PARTICIPATION_LABEL[activity.participation_mode]} />
        {(activity.team_min_size || activity.team_max_size) && (
          <Row
            label="팀 인원"
            value={`${activity.team_min_size ?? "?"}~${activity.team_max_size ?? "?"}명`}
          />
        )}
        <Row label="지원 자격" value={activity.eligibility ?? "미정 (원문 확인 필요)"} />
        <Row label="혜택" value={activity.benefit ?? "미정"} />
      </section>

      <section className="mb-4 flex flex-col gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm">
        <h2 className="mb-1 text-sm font-semibold text-[var(--color-muted-foreground)]">일정 (KST)</h2>
        <Row label="접수 시작" value={formatKst(activity.apply_start_at)} />
        <Row label="접수 마감" value={formatKst(activity.apply_end_at)} />
        <Row label="활동 시작" value={formatKst(activity.activity_start_at)} />
        <Row label="활동 종료" value={formatKst(activity.activity_end_at)} />
        <Row
          label="마지막 확인"
          value={activity.last_verified_at ? formatKst(activity.last_verified_at) : "확인 기록 없음"}
        />
      </section>

      {activity.description && (
        <section className="mb-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm whitespace-pre-wrap">
          {activity.description}
        </section>
      )}

      {tags && tags.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <Badge key={t.tag} variant="neutral">
              #{t.tag}
            </Badge>
          ))}
        </div>
      )}

      {isHttpUrl(activity.source_url) && (
        <a
          href={activity.source_url}
          target="_blank"
          rel="noreferrer"
          className="mb-6 inline-block rounded-md bg-[var(--color-brand-600)] px-4 py-2.5 text-sm font-medium text-white"
        >
          원문에서 확인하기 ↗
        </a>
      )}
      <p className="mb-6 text-xs text-[var(--color-muted-foreground)]">
        지원·접수는 원문 사이트에서 진행돼요. 이 서비스는 지원을 대행하지 않아요.
      </p>

      <section className="mb-4">
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-muted-foreground)]">추천 근거</h2>
        {!userData.user ? (
          <EmptyState title="로그인하면 맞춤 추천 근거를 볼 수 있어요" />
        ) : recommendation && !recommendation.isDiscovery && recommendation.reasons.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="info">{Math.round(recommendation.score ?? 0)}점</Badge>
            {recommendation.reasons.map((reason) => (
              <Badge key={reason} variant="neutral">
                {reason}
              </Badge>
            ))}
          </div>
        ) : (
          <EmptyState
            title="아직 추천 근거가 충분하지 않아요"
            description="프로필의 관심분야·희망 활동 유형·참여 조건을 채우면 더 정확히 계산돼요."
          />
        )}
      </section>

      <section className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-muted-foreground)]">관련 파티</h2>
          {userData.user && activity.participation_mode !== "solo" && activity.status === "published" && (
            <Link href={`/parties/new?activity=${id}`} className="text-sm text-[var(--color-brand-700)] underline">
              파티 만들기
            </Link>
          )}
        </div>
        {!userData.user ? (
          <EmptyState title="로그인하면 파티를 보고 지원할 수 있어요" />
        ) : relatedParties.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {relatedParties.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/parties/${p.id}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm"
                >
                  <span>{p.title ?? "제목 없는 파티"}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-[var(--color-muted-foreground)]">
                      {p.activeMemberCount}/{p.capacity}명
                    </span>
                    <Badge variant={partyStatusBadgeVariant(p.status)}>{PARTY_STATUS_LABEL[p.status] ?? p.status}</Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="아직 만들어진 파티가 없어요"
            description={activity.participation_mode === "solo" ? "개인 참여 활동이라 파티가 필요 없어요." : "가장 먼저 파티를 만들어 보세요."}
          />
        )}
        {userData.user && activity.participation_mode !== "solo" && activity.status === "published" && (
          <Link
            href={`/match/${id}`}
            className="mt-3 inline-block rounded-md border border-[var(--color-brand-300)] bg-[var(--color-brand-50)] px-4 py-2.5 text-sm font-medium text-[var(--color-brand-700)]"
          >
            빠른 매칭으로 팀 찾기
          </Link>
        )}
      </section>
    </PageContainer>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-[var(--color-muted-foreground)]">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
