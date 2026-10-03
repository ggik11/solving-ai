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
