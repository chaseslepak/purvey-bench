import { defineConfig } from "vitest/config";

// Row-level security tests against a real Postgres (see scripts/local-db.sh).
export default defineConfig({
  test: {
    include: ["tests/db/**/*.test.ts"],
    globalSetup: ["tests/db/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
