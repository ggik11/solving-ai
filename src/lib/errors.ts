// DB 함수는 'CODE: 설명' 형식으로 raise한다. 코드가 필요한 호출자(멤버십 상실 감지 등)는
// parseDbError로 코드를 받고, 그냥 보여주기만 하면 friendlyError로 설명만 받는다.

export interface DbError {
  code: string;
  message: string;
}

export function parseDbError(error: { message: string } | null, fallback: string): DbError {
  if (!error) return { code: "UNKNOWN", message: fallback };
  const idx = error.message.indexOf(": ");
  if (idx < 0) return { code: "UNKNOWN", message: error.message };
  return { code: error.message.slice(0, idx), message: error.message.slice(idx + 2) };
}

export function friendlyError(error: { message: string } | null, fallback: string): string {
  return parseDbError(error, fallback).message;
}

/**
 * Postgres unique violation(23505)인지 확인한다. 연타·네트워크 재시도 등으로 같은 멱등 삽입이
 * 거의 동시에 두 번 들어와도 "이미 있음"은 실패가 아니라 성공으로 취급해야 하는 호출자가 쓴다
 * (예: 북마크·차단 토글).
 */
export function isDuplicateKeyError(error: { code?: string } | null | undefined): boolean {
  return error?.code === "23505";
}
