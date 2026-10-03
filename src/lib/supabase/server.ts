import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server Component/Route Handler/Server Action에서 쓰는 Supabase 클라이언트.
 * 항상 anon key + 호출자의 세션 쿠키로 동작하므로, 모든 쓰기는 RLS로 재검증된다.
 * service-role 키는 여기서 쓰지 않는다 (테스트 하네스·시드 전용).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Component에서는 쿠키를 쓸 수 없다. 미들웨어가 세션 갱신을 담당하므로 무시한다.
          }
        },
      },
    }
  );
}
