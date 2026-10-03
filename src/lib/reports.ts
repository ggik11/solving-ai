// 신고/감사/계정 상태 표시 공통 헬퍼 (architecture.md 8장 "차단과 신고", 6장 권한표).

export const REPORT_REASON_LABEL: Record<string, string> = {
  spam: "스팸·도배",
  harassment: "욕설·혐오 발언",
  inappropriate: "부적절한 콘텐츠",
  scam: "사기·허위 정보",
  other: "기타",
};

export const REPORT_TARGET_TYPE_LABEL: Record<string, string> = {
  profile: "사용자",
  party: "파티",
  chat_message: "채팅 메시지",
  activity: "활동",
};

export const REPORT_STATUS_LABEL: Record<string, string> = {
  open: "접수",
  reviewing: "검토 중",
  resolved: "조치",
  dismissed: "기각",
};

export function reportStatusBadgeVariant(status: string): "info" | "warning" | "success" | "neutral" {
  switch (status) {
    case "open":
      return "warning";
    case "reviewing":
      return "info";
    case "resolved":
      return "success";
    default:
      return "neutral";
  }
}

export const ACCOUNT_STATUS_LABEL: Record<string, string> = {
  active: "정상",
  suspended: "정지됨",
  withdrawn: "탈퇴함",
};
