/**
 * 추출한 날짜가 "원문에 실제로 있는 문자열"인지 대조하고, 접수 기간이 상식적인 범위인지
 * 검사하는 순수 함수. LLM이 제안한 날짜라도 이 검증을 통과하지 못하면 버리고
 * "원문 확인 필요"로 표시한다(지시서 요구사항 그대로).
 */
import { isKstMidnight } from "@/lib/format";

function normalizeForSubstringCheck(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** `raw`(추출 시점에 원문에서 찾은 문자열)가 `sourceText`에 그대로 있는지 확인한다. */
export function verifyDateAgainstText(raw: string, sourceText: string): boolean {
  if (!raw.trim()) return false;
  return normalizeForSubstringCheck(sourceText).includes(normalizeForSubstringCheck(raw));
}

export interface DateRangeConfig {
  maxPastDays: number;
  maxFutureDays: number;
}

export const DEFAULT_DATE_RANGE_CONFIG: DateRangeConfig = { maxPastDays: 14, maxFutureDays: 548 };

export type DateRangeIssue = "START_AFTER_END" | "TOO_FAR_PAST" | "TOO_FAR_FUTURE" | "DATE_ONLY_NO_TIME";

/**
 * 시작일이 마감일보다 늦거나, 마감이 지나치게 과거/미래거나, 시각 없이 날짜만 있는지 검사한다.
 * 어떤 이슈도 등록을 "막지" 않는다 — 전부 표시용 신호이며, 기존 날짜 정밀도 규칙(`formatKst`의
 * 자정=날짜만 표시)과 모집 상태 계산(`getApplyPhase`)에는 영향을 주지 않는다.
 */
export function checkDateRangeIssues(
  input: { applyStartIso: string | null; applyEndIso: string | null },
  config: DateRangeConfig = DEFAULT_DATE_RANGE_CONFIG,
  now: Date = new Date()
): DateRangeIssue[] {
  const issues: DateRangeIssue[] = [];
  const start = input.applyStartIso ? new Date(input.applyStartIso) : null;
  const end = input.applyEndIso ? new Date(input.applyEndIso) : null;

  if (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start.getTime() > end.getTime()) {
    issues.push("START_AFTER_END");
  }

  if (end && !Number.isNaN(end.getTime())) {
    const diffDays = (end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays < -config.maxPastDays) issues.push("TOO_FAR_PAST");
    if (diffDays > config.maxFutureDays) issues.push("TOO_FAR_FUTURE");
    if (isKstMidnight(input.applyEndIso)) issues.push("DATE_ONLY_NO_TIME");
  }

  return issues;
}

export const DATE_RANGE_ISSUE_LABEL: Record<DateRangeIssue, string> = {
  START_AFTER_END: "접수 시작일이 마감일보다 늦어요.",
  TOO_FAR_PAST: "마감일이 이미 많이 지난 날짜예요. 원문을 다시 확인해 주세요.",
  TOO_FAR_FUTURE: "마감일이 지나치게 먼 미래예요. 원문을 다시 확인해 주세요.",
  DATE_ONLY_NO_TIME: "마감 시각이 없어 날짜만 저장돼요(00:00 KST로 표시).",
};
