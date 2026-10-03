import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 개발 서버는 기본적으로 "localhost"와 자신이 기동된 호스트 이외의 Origin에서 오는
  // _next/* 자산 요청(HMR 포함)을 403으로 막는다. 이 프로젝트는 README/Supabase 설정과
  // 맞추기 위해 127.0.0.1로 접속하는 경우가 있어, 그 호스트도 명시적으로 허용해야
  // 하이드레이션이 끝까지 된다(허용하지 않으면 메인 번들 청크가 403이 되어 리액트가
  // 전혀 부트스트랩되지 않는다 — 버튼 클릭이 무반응인 증상으로 나타난다).
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
