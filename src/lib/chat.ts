// 채팅 메시지 본문에서 안전한 링크만 추려내는 순수 함수. 항상 일반 텍스트 노드로 렌더링하므로
// (dangerouslySetInnerHTML을 쓰지 않음) HTML은 절대 실행되지 않고, http/https로 시작하는
// URL만 클릭 가능한 링크로 바뀐다(javascript: 등 다른 스킴은 텍스트로만 표시됨).

const URL_SPLIT_PATTERN = /(https?:\/\/[^\s<>"']+)/g;
const URL_TEST_PATTERN = /^https?:\/\//;

export interface MessageSegment {
  type: "text" | "link";
  value: string;
}

export function splitMessageSegments(body: string): MessageSegment[] {
  return body
    .split(URL_SPLIT_PATTERN)
    .filter((part) => part.length > 0)
    .map((part) => ({ type: URL_TEST_PATTERN.test(part) ? "link" : "text", value: part }));
}
