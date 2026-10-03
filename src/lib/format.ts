const KST_TIME_ZONE = "Asia/Seoul";

/**
 * KST 기준으로 날짜를 표시한다. 시각이 자정(00:00 KST)이면 "날짜만 입력된 값"으로 보고
 * 날짜만 표시하고, 그 외에는 날짜+시간을 함께 표시한다(지시서: "날짜 정밀도 반영").
 */
export function formatKst(iso: string | null | undefined): string {
  if (!iso) return "미정";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "미정";

  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: KST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const dateOnly = `${get("year")}.${get("month")}.${get("day")}`;
  const isMidnight = get("hour") === "00" && get("minute") === "00";

  return isMidnight ? `${dateOnly} (KST)` : `${dateOnly} ${get("hour")}:${get("minute")} (KST)`;
}

export function formatKstDateOnly(iso: string | null | undefined): string {
  if (!iso) return "미정";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "미정";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: KST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export type ApplyPhase = "upcoming" | "open" | "closing_soon" | "closed";

const CLOSING_SOON_WINDOW_MS = 1000 * 60 * 60 * 24 * 2; // 48시간 이내면 "마감임박"

export function getApplyPhase(
  applyStartAt: string | null,
  applyEndAt: string | null,
  now: Date = new Date()
): ApplyPhase {
  const start = applyStartAt ? new Date(applyStartAt) : null;
  const end = applyEndAt ? new Date(applyEndAt) : null;

  if (start && now < start) return "upcoming";
  if (end && now > end) return "closed";
  if (end && end.getTime() - now.getTime() <= CLOSING_SOON_WINDOW_MS) return "closing_soon";
  return "open";
}

export const APPLY_PHASE_LABEL: Record<ApplyPhase, string> = {
  upcoming: "접수예정",
  open: "모집중",
  closing_soon: "마감임박",
  closed: "마감",
};

/** last_verified_at이 없거나 오래되면 "원문 확인 필요" 배지를 띄운다. */
const VERIFICATION_STALE_MS = 1000 * 60 * 60 * 24 * 30; // 30일

export function needsSourceVerification(lastVerifiedAt: string | null, now: Date = new Date()): boolean {
  if (!lastVerifiedAt) return true;
  const verified = new Date(lastVerifiedAt);
  if (Number.isNaN(verified.getTime())) return true;
  return now.getTime() - verified.getTime() > VERIFICATION_STALE_MS;
}
