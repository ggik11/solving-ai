import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name}이 설정되어 있지 않습니다. .env.local에 로컬 Supabase 값을 채워주세요 (supabase start 출력 참고).`
    );
  }
  return value;
}

export const SUPABASE_URL = () => requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const ANON_KEY = () => requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SERVICE_ROLE_KEY = () => requireEnv("SUPABASE_SERVICE_ROLE_KEY");

/** service_role 키로 RLS를 우회하는 관리용 클라이언트 (시드 조회·세션 발급에만 사용). */
export function createAdminClient(): SupabaseClient {
  return createClient(SUPABASE_URL(), SERVICE_ROLE_KEY(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** 로그인하지 않은(anon key만 쓰는) 클라이언트 — "비로그인 사용자" 테스트용. */
export function createAnonClient(): SupabaseClient {
  return createClient(SUPABASE_URL(), ANON_KEY(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * 실제 매직링크 로그인 플로우를 그대로 거쳐(admin.generateLink -> verifyOtp)
 * 특정 테스트 유저로 로그인된 클라이언트를 만든다. 비밀번호를 쓰지 않는다.
 */
export async function signInAs(email: string): Promise<SupabaseClient> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error || !data) {
    throw new Error(`generateLink 실패 (${email}): ${error?.message}`);
  }

  const tokenHash = data.properties?.hashed_token;
  if (!tokenHash) {
    throw new Error(`magiclink token_hash를 받지 못했습니다 (${email})`);
  }

  const client = createAnonClient();
  const { data: verified, error: verifyError } = await client.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });
  if (verifyError || !verified.session) {
    throw new Error(`verifyOtp 실패 (${email}): ${verifyError?.message}`);
  }

  return client;
}

export const TEST_USERS = {
  admin: { id: "a0000000-0000-0000-0000-000000000001", email: "admin@smu.ac.kr" },
  student1: { id: "a0000000-0000-0000-0000-000000000002", email: "student1@smu.ac.kr" },
  student2: { id: "a0000000-0000-0000-0000-000000000003", email: "student2@smu.ac.kr" },
  student3: { id: "a0000000-0000-0000-0000-000000000004", email: "student3@smu.ac.kr" },
  student4: { id: "a0000000-0000-0000-0000-000000000005", email: "student4@smu.ac.kr" },
} as const;

/** PostgREST 에러가 RLS 거부(또는 그에 준하는 권한 오류)로 보이는지 확인. */
export function isRejected(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  // RLS 위반(42501), PostgREST의 "no rows"로 보이는 0-row 결과, 체크/유니크 제약 위반(23xxx) 모두
  // "쓰기가 거부되었다"는 관찰 가능한 결과로 인정한다.
  return true;
}
