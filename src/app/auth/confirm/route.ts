import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// 매직링크/OTP 이메일이 가리키는 콜백. token_hash를 세션으로 교환한 뒤
// 온보딩 완료 여부에 따라 보낼 곳을 정한다. 비밀번호·개발용 우회 로그인은 없다.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  // request.url의 origin을 그대로 쓰지 않는다 — Next dev 서버는 실제 접속 호스트(예: 127.0.0.1:3000)와
  // 무관하게 request.url을 "localhost:3000" 기준으로 보고할 때가 있어, 쿠키가 설정된 호스트와
  // 리다이렉트 대상 호스트가 달라져 세션이 끊기는 문제가 있었다. 클라이언트가 실제로 보낸
  // Host 헤더를 그대로 써서 같은 호스트로만 리다이렉트한다.
  const host = request.headers.get("host") ?? "localhost:3000";
  const protocol = request.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const origin = `${protocol}://${host}`;
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

  const destination = profile?.onboarding_completed_at ? "/" : "/onboarding";
  return NextResponse.redirect(`${origin}${destination}`);
}
