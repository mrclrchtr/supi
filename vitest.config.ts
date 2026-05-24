import { defineConfig } from "vitest/config";

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
    exclude: ["**/node_modules/**", "**/.worktrees/**", "**/dist/**"],
    onUnhandledError(error) {
      if (isBenignVscodeJsonRpcShutdownNoise(error)) {
        return false;
      }
    },
  },
});
