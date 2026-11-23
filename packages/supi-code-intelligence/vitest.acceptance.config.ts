import { defineConfig } from "vitest/config";

export default defineConfig({
  root: import.meta.dirname,
  test: {
    include: ["__tests__/acceptance/**/*.acceptance.ts"],
    pool: "threads",
    // Each file starts its own server in its own temporary workspace, so files run in parallel.
    // Three workers match the smallest CI runner (3 vCPU on macOS).
    maxWorkers: 3,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
