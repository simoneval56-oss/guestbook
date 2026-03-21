import { defineConfig } from "@playwright/test";
import { getEnv, getRequiredEnv } from "./tests/e2e/utils/env";

const E2E_BASE_URL = getRequiredEnv("E2E_BASE_URL").trim().replace(/\/+$/, "");
const E2E_VERCEL_BYPASS_SECRET = getEnv("E2E_VERCEL_BYPASS_SECRET")?.trim();

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.remote.spec.ts",
  timeout: 240_000,
  expect: {
    timeout: 10_000
  },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: E2E_BASE_URL,
    extraHTTPHeaders: E2E_VERCEL_BYPASS_SECRET
      ? {
          "x-vercel-protection-bypass": E2E_VERCEL_BYPASS_SECRET
        }
      : undefined,
    trace: "on-first-retry"
  }
});
