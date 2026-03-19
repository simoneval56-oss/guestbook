import { defineConfig } from "@playwright/test";

const E2E_BASE_URL = process.env.E2E_BASE_URL?.trim().replace(/\/+$/, "");

if (!E2E_BASE_URL) {
  throw new Error("Missing E2E_BASE_URL for remote Playwright tests.");
}

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
    trace: "on-first-retry"
  }
});
