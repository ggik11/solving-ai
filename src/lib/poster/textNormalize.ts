/**
 * 포스터 2차 후처리 P1(가이드 8장) — OCR·제목·설명 텍스트를 다음 단계(키워드 매칭, 임베딩)가
 * 쓰기 좋게 다듬는 순수 함수. OCR은 글자 사이에 엉뚱한 공백을 끼워 넣는 경우가 잦아
 * ("해 커 톤"), 매칭용 버전은 공백을 아예 없앤다.
 */
export interface NormalizedText {
  /** 줄바꿈·연속 공백을 하나의 공백으로 정리하고 영문을 소문자화한, 사람이 읽기 좋은 버전. */
  normalized: string;
  /** normalized에서 공백을 전부 뺀 버전 — 키워드 포함 여부 검사에 쓴다(예: "해 커 톤" -> "해커톤"). */
  matchKey: string;
}

export function normalizeText(raw: string): NormalizedText {
  const normalized = raw.replace(/\s+/g, " ").trim().toLowerCase();
  const matchKey = normalized.replace(/\s+/g, "");
  return { normalized, matchKey };
}
