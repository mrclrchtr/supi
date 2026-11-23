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

// Tests that start real language-server processes. They compete for CPU with the unit suite and
// time out under full parallel load, so they run in their own project after it finishes.
const serverTests = [
  "packages/supi-lsp/__tests__/integration/**/*.test.ts",
  "packages/supi-code-intelligence/__tests__/integration/substrate/lsp/**/*.test.ts",
];

// Tests that run Pi's codemode. Pi locates its codemode worker and QuickJS WASM relative to its own
// module files, so these tests need the installed package rather than the pre-bundled copy.
const piRuntimeTests = [
  "packages/*/__tests__/integration/*codemode*.test.ts",
  "packages/supi-agent-runtime/__tests__/integration/auxiliary-model-authority.test.ts",
  "packages/supi-review/__tests__/integration/discovery-tools.test.ts",
];

// Worker threads start faster than forks. They cannot call process.chdir(), and their process.env
// changes do not reach os.homedir(): pass cwd and homeDir explicitly.
const unitPool = "threads";

// Every option lives here: Vitest runs from the repository root and ignores package-level configs.
export default defineConfig({
  test: {
    testTimeout: 5000,
    hookTimeout: 5000,
    fsModuleCache: true,
    env: {
      TMPDIR: testTmpDir,
      TMP: testTmpDir,
      TEMP: testTmpDir,
      // Git starts detached maintenance after a commit. Its lock files appear and vanish inside
      // fixture repositories while tests copy or delete them, which fails with ENOENT.
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "maintenance.auto",
      GIT_CONFIG_VALUE_0: "false",
    },
    exclude: ["**/node_modules/**", "**/.worktrees/**", "**/dist/**"],
    onUnhandledError(error) {
      if (isBenignVscodeJsonRpcShutdownNoise(error)) {
        return false;
      }
    },
    projects: [
      {
        test: {
          name: "unit",
          include: ["**/*.test.{ts,mjs}"],
          exclude: [...serverTests, ...piRuntimeTests],
          pool: unitPool,
          // Each test file re-imports its dependencies. Pi alone is about 1,700 modules, so
          // pre-bundle it and TypeBox into single files (cached in node_modules/.vite).
          deps: {
            optimizer: {
              ssr: {
                enabled: true,
                include: [
                  "@earendil-works/pi-coding-agent",
                  "@earendil-works/pi-ai",
                  "@earendil-works/pi-tui",
                  "typebox",
                  "typebox/value",
                ],
              },
            },
          },
          sequence: { groupOrder: 0 },
        },
      },
      {
        test: {
          name: "pi-runtime",
          include: piRuntimeTests,
          pool: unitPool,
          sequence: { groupOrder: 0 },
        },
      },
      {
        test: {
          name: "servers",
          include: serverTests,
          // Writes per-test LSP debug events when SUPI_TEST_DEBUG_DIR is set.
          setupFiles: ["packages/supi-lsp/__tests__/helpers/server-test-debug.ts"],
          testTimeout: 10_000,
          hookTimeout: 30_000,
          maxWorkers: 3,
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
