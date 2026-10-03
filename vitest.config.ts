import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.{ts,tsx}", "tests/rls/**/*.test.ts"],
    exclude: ["tests/e2e/**"],
    setupFiles: ["./tests/setup.ts"],
    hookTimeout: 30000,
    testTimeout: 30000,
    // tests/rls는 공유된 로컬 Supabase 인스턴스 상태에 의존하고, 동일 이메일에 대한
    // magic link 생성은 auth.rate_limit.max_frequency("1s")로 묶여 있어 파일을 병렬로
    // 돌리면 레이스(이미 소비된 토큰 재사용)가 난다. 파일 단위로 순차 실행한다.
    fileParallelism: false,
  },
});
