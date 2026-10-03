import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSafeRelativePath, pickRequestOrigin, resolveAllowedOrigins } from "@/lib/url";

// 매직링크/OTP 이메일이 가리키는 콜백. token_hash를 세션으로 교환한 뒤
// 온보딩 완료 여부에 따라 보낼 곳을 정한다. 비밀번호·개발용 우회 로그인은 없다.
//
// origin은 요청의 Host 헤더를 신뢰하지 않는다 — Host는 클라이언트가 보내는 값이라
// 조작 가능하고(Host 헤더 포이즈닝), 그대로 리다이렉트 origin으로 쓰면 오픈 리다이렉트로
// 악용될 수 있다. 대신 NEXT_PUBLIC_SITE_URL(+ 선택적 ...ALIASES)로 만든 허용 목록에서만
// 고른다. `next` 파라미터도 같은 사이트 내 상대경로일 때만 허용한다.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const allowedOrigins = resolveAllowedOrigins(
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_SITE_URL_ALIASES
  );
  const origin = pickRequestOrigin(request.headers.get("host"), allowedOrigins);

  const nextParam = searchParams.get("next");
  const safeNext = isSafeRelativePath(nextParam) ? nextParam : null;

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${origin}/login?error=invalid_link`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=invalid_link`);
  }

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.redirect(`${origin}/login?error=invalid_link`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed_at")
    .eq("id", userData.user.id)
    .single();

  // 온보딩을 마치지 않은 사용자는 next를 무시하고 항상 온보딩으로 보낸다.
  const destination = profile?.onboarding_completed_at ? safeNext ?? "/" : "/onboarding";
  return NextResponse.redirect(`${origin}${destination}`);
}
