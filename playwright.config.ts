import { defineConfig } from "@playwright/test";

const BENCH_URL = process.env.BENCH_URL ?? "http://localhost:3100";

export default defineConfig({
  testDir: "tests",
  testMatch: ["visual/**/*.spec.ts", "e2e/**/*.spec.ts"],
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: BENCH_URL, deviceScaleFactor: 1, trace: "off" },
  webServer: process.env.BENCH_URL
    ? undefined
    : { command: "npx next start -p 3100", url: BENCH_URL, reuseExistingServer: true, timeout: 120_000 },
});
