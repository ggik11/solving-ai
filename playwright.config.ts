import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";
import path from "node:path";

// vitest는 Vite가 .env.local을 자동으로 읽어 들이지만 Playwright는 그렇지 않다 — 테스트(서비스
// 역할 키로 데이터를 준비하는 e2e 스펙 등)가 쓸 수 있도록 여기서도 명시적으로 로드한다.
config({ path: path.resolve(__dirname, ".env.local") });

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
    // 배포 산출물과 동일한 환경에서 검증하기 위해 프로덕션 빌드를 대상으로 한다(README 참고).
    // 한때 dev 서버의 allowedDevOrigins 문제로 하이드레이션이 깨졌던 적이 있었는데(해결됨),
    // 그것과 무관하게 E2E는 어차피 build+start를 쓰는 편이 더 바람직하다.
    command: "npm run build && npm run start",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
