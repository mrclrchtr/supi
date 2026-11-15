import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "vitest/config";

// Collect test temp files under one fixed directory instead of thousands of top-level $TMPDIR
// entries (#597). It must stay outside any Git repository, because workspace fixtures would
// otherwise inherit the parent repo's ignore rules. No code deletes it; the OS temp purge does.
const testTmpDir = join(tmpdir(), "supi-vitest");
mkdirSync(testTmpDir, { recursive: true });

// Ignore the known benign vscode-jsonrpc stream-destroyed rejection that can
// surface during optional LSP integration-test shutdown on some servers.
function isBenignVscodeJsonRpcShutdownNoise(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const type = "type" in error ? (error as { type?: unknown }).type : undefined;
  const code = "code" in error ? (error as { code?: unknown }).code : undefined;
  const message = "message" in error ? (error as { message?: unknown }).message : undefined;
  const stack = "stack" in error ? (error as { stack?: unknown }).stack : undefined;

  return (
    type === "Unhandled Rejection" &&
    code === "ERR_STREAM_DESTROYED" &&
    message === "Cannot call write after a stream was destroyed" &&
    typeof stack === "string" &&
    stack.includes("vscode-jsonrpc")
  );
}

export default defineConfig({
  test: {
    testTimeout: 2000,
    hookTimeout: 5000,
    fsModuleCache: true,
    env: { TMPDIR: testTmpDir, TMP: testTmpDir, TEMP: testTmpDir },
    exclude: ["**/node_modules/**", "**/.worktrees/**", "**/dist/**"],
    onUnhandledError(error) {
      if (isBenignVscodeJsonRpcShutdownNoise(error)) {
        return false;
      }
    },
  },
});
