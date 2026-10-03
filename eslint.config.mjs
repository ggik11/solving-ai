import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Ruflo/claude-flow 툴링 런타임 디렉터리 — 앱 소스가 아니다.
    ".claude/**",
    ".claude-flow/**",
    ".swarm/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
