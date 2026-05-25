import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Longer timeout for LSP process startup in integration tests
    testTimeout: 10000,
  },
});
