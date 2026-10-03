// 차단 관계 적용 공통 헬퍼 (architecture.md 4장 "차단 관계" 불변식).
// DB 레벨 제외(자동 매칭 _blocked(), apply_to_party)와 달리, "관련 파티" 목록처럼 이미 조회된
// 결과를 화면에서 걸러내는 쪽은 순수 함수로 분리해 단위 테스트한다.

export interface BlockRow {
  blocker_id: string;
  blocked_id: string;
}

/** 로그인한 사용자(viewerId) 기준으로 "서로 차단한" 상대 profile id 집합을 만든다(방향 무관). */
export function blockedCounterpartIds(viewerId: string, blocks: BlockRow[]): Set<string> {
  const set = new Set<string>();
  for (const b of blocks) {
    if (b.blocker_id === viewerId) set.add(b.blocked_id);
    if (b.blocked_id === viewerId) set.add(b.blocker_id);
  }
  return set;
}

/**
 * 파티 목록에서 "활성 멤버 중 한 명이라도 나와 차단 관계인" 파티를 제외한다.
 * ("새 파티 추천"에서 차단 사용자를 제외 — 지시서 8장 "차단과 신고").
 */
export function filterPartiesExcludingBlocked<T extends { party_members: { profile_id: string; status: string }[] }>(
  parties: T[],
  blockedProfileIds: Set<string>
): T[] {
  if (blockedProfileIds.size === 0) return parties;
  return parties.filter(
    (p) => !p.party_members.some((m) => m.status === "active" && blockedProfileIds.has(m.profile_id))
  );
}

/** 채팅 메시지 목록에서 차단한 상대의 메시지를 숨긴다(시스템 메시지는 항상 남긴다). */
export function filterMessagesExcludingBlocked<T extends { sender_id: string | null }>(
  messages: T[],
  blockedProfileIds: Set<string>
): T[] {
  if (blockedProfileIds.size === 0) return messages;
  return messages.filter((m) => m.sender_id === null || !blockedProfileIds.has(m.sender_id));
}
