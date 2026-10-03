/**
 * 리다이렉트 안전성 관련 순수 함수. `/auth/confirm`에서 Host 헤더를 신뢰하지 않고
 * 환경변수 기반 허용 목록으로 origin을 고르기 위해 분리했다 (단위 테스트 용이성).
 */

/** NEXT_PUBLIC_SITE_URL(필수) + NEXT_PUBLIC_SITE_URL_ALIASES(선택, 쉼표 구분)로 허용 origin 목록을 만든다. */
export function resolveAllowedOrigins(
  siteUrl: string | undefined,
  aliases: string | undefined
): string[] {
  const candidates = [siteUrl, ...(aliases ? aliases.split(",") : [])];
  const origins: string[] = [];
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (!trimmed) continue;
    try {
      // 정규화 + 유효성 검증(스킴 없는 값, 공백 등을 걸러낸다).
      const normalized = new URL(trimmed).origin;
      if (!origins.includes(normalized)) origins.push(normalized);
    } catch {
      // 잘못된 값은 무시한다 — 허용 목록에 넣지 않는 것이 안전한 기본값이다.
    }
  }
  return origins;
}

/**
 * 요청의 Host 헤더가 허용 목록 중 하나와 일치하면 그 origin을 쓰고(로컬 개발에서
 * 127.0.0.1/localhost 둘 다 접속 가능하도록), 일치하지 않으면(조작된 Host 헤더 포함)
 * 목록의 첫 번째(기본) origin으로 안전하게 되돌린다. Host 헤더 값 자체를 origin으로
 * 쓰는 일은 없다.
 */
export function pickRequestOrigin(hostHeader: string | null, allowedOrigins: string[]): string {
  if (allowedOrigins.length === 0) {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL이 설정되어 있지 않습니다. 허용된 리다이렉트 origin을 최소 1개 설정해야 합니다."
    );
  }
  if (hostHeader) {
    const match = allowedOrigins.find((origin) => {
      try {
        return new URL(origin).host === hostHeader;
      } catch {
        return false;
      }
    });
    if (match) return match;
  }
  return allowedOrigins[0];
}

/**
 * `next` 쿼리 파라미터가 같은 사이트 내 상대경로일 때만 안전하다고 판단한다.
 * - "/"로 시작해야 하고 "//"(프로토콜 상대 URL)나 "/\"(브라우저가 "//"로 취급) 로는
 *   시작할 수 없다.
 * - 디코딩한 결과에 "://" 같은 스킴 구분자가 포함되면 거부한다(인코딩으로 숨긴 외부 URL 방지).
 * - 개행/제어문자가 섞인 값도 거부한다.
 */
export function isSafeRelativePath(next: string | null | undefined): next is string {
  if (!next) return false;
  if (!next.startsWith("/")) return false;
  if (next.startsWith("//") || next.startsWith("/\\")) return false;
  if (/[\r\n\t\0]/.test(next)) return false;

  let decoded: string;
  try {
    decoded = decodeURIComponent(next);
  } catch {
    return false;
  }
  if (decoded.startsWith("//") || decoded.startsWith("/\\")) return false;
  if (decoded.includes("://")) return false;
  if (/[\r\n\t\0]/.test(decoded)) return false;

  return true;
}
