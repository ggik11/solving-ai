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
