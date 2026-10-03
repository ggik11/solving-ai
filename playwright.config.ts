import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  // 공유된 로컬 Supabase 인스턴스(같은 DB)에 로그인/시드 데이터로 의존하는 테스트가 섞여 있어
  // 파일을 순차 실행한다(RLS Vitest 스위트와 같은 이유).
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // next dev(Turbopack)의 HMR 웹소켓이 이 환경에서 핸드셰이크에 실패해 클라이언트 번들
    // 부트스트랩이 막히고 하이드레이션 자체가 되지 않는 문제가 있었다(React 이벤트가 전혀
    // 붙지 않아 폼이 네이티브 GET으로 제출됨). HMR이 없는 프로덕션 빌드로 띄워 피해간다 —
    // 어차피 E2E는 프로덕션 빌드를 대상으로 하는 편이 더 바람직하다.
    command: "npm run build && npm run start",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
