// 파티 상태 표시 공통 헬퍼 (architecture.md 5.1절 상태 전이).

export const PARTY_STATUS_LABEL: Record<string, string> = {
  recruiting: "모집 중",
  full: "정원 마감",
  confirmed: "확정됨",
  completed: "활동 종료",
  cancelled: "해산됨",
};

export function partyStatusBadgeVariant(status: string): "info" | "warning" | "success" | "neutral" {
  switch (status) {
    case "recruiting":
      return "info";
    case "full":
      return "warning";
    case "confirmed":
      return "success";
    default:
      return "neutral";
  }
}

export const APPLICATION_STATUS_LABEL: Record<string, string> = {
  pending: "대기 중",
  approved: "승인됨",
  rejected: "거절됨",
  cancelled: "취소됨",
  superseded: "자동 종료(다른 파티 승인)",
};

export interface RoleSlotSummary {
  id: string;
  role_name: string;
  capacity: number;
  filled_count: number;
}

/** "기획 1/1 · 개발 1/2 · 디자인 0/1" 형식의 역할별 현황 문자열 (요청: 파티 목록/상세 공통 표시). */
export function formatRoleSlotSummary(slots: RoleSlotSummary[]): string {
  return slots.map((s) => `${s.role_name} ${s.filled_count}/${s.capacity}`).join(" · ");
}

/** 아직 정원이 차지 않은 역할 이름 목록. */
export function missingRoleNames(slots: RoleSlotSummary[]): string[] {
  return slots.filter((s) => s.filled_count < s.capacity).map((s) => s.role_name);
}

// 모집 마감(recruit_deadline) 입력값 검사 — 파티 생성/수정 폼(클라이언트)과 서버 액션(서버) 양쪽에서
// 같은 규칙을 쓴다. DB의 p_recruit_deadline은 timestamptz라 해석 불가능한 문자열을 그대로 넘기면
// PostgREST가 알아보기 힘든 타입 캐스팅 오류를 그대로 보여주게 되므로, 그 전에 여기서 막는다.

export type RecruitDeadlineIssue = "INVALID" | "TOO_FAR_PAST" | "TOO_FAR_FUTURE";

/** 활동 원문 날짜 검증(activity-import)과 같은 상한을 쓴다 — 과거 1일, 미래 약 18개월. */
const RECRUIT_DEADLINE_MAX_PAST_DAYS = 1;
const RECRUIT_DEADLINE_MAX_FUTURE_DAYS = 548;

export const RECRUIT_DEADLINE_ISSUE_LABEL: Record<RecruitDeadlineIssue, string> = {
  INVALID: "모집 마감 날짜를 올바르게 입력해 주세요.",
  TOO_FAR_PAST: "모집 마감이 이미 지난 날짜예요. 다시 확인해 주세요.",
  TOO_FAR_FUTURE: "모집 마감이 너무 먼 미래예요. 다시 확인해 주세요.",
};

/**
 * 모집 마감 입력값을 검사한다. 비어 있으면(선택 항목이므로) 유효하다고 본다.
 * `value`는 `<input type="datetime-local">` 값(클라이언트)이나 ISO 문자열(서버) 둘 다 받을 수
 * 있다 — 둘 다 `new Date()`로 해석 가능한 형식이다.
 */
export function validateRecruitDeadline(
  value: string | null | undefined,
  now: Date = new Date()
): RecruitDeadlineIssue | null {
  if (!value || !value.trim()) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "INVALID";

  const diffDays = (date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays < -RECRUIT_DEADLINE_MAX_PAST_DAYS) return "TOO_FAR_PAST";
  if (diffDays > RECRUIT_DEADLINE_MAX_FUTURE_DAYS) return "TOO_FAR_FUTURE";
  return null;
}
