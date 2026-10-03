import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // _next/ 전체(정적 자산뿐 아니라 HMR 웹소켓 등 내부 경로 포함)를 제외해야 한다.
  // _next/static|_next/image만 빼면 _next/hmr 같은 업그레이드 요청까지 가로채
  // 세션 조회(await) 때문에 핸드셰이크가 깨진다.
  matcher: [
    "/((?!_next/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
