import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { createTreeSitterProvider } from "@mrclrchtr/supi-tree-sitter/provider/tree-sitter-provider";
import { afterEach, describe, expect, it } from "vitest";
import codeIntelligenceExtension from "../../src/extension.ts";
import { clearMockRuntime } from "../helpers/register-mock-runtime.ts";

const WORKER_CLIENT_PATH = "../../../supi-tree-sitter/src/session/structural-worker-client.ts";
const workerClient = await import(WORKER_CLIENT_PATH);

let session: { dispose(): Promise<void> } | undefined;
let cwd: string | undefined;

afterEach(async () => {
  await session?.dispose();
  if (cwd) {
    getDefaultWorkspaceRuntime().clearWorkspace(cwd);
    rmSync(cwd, { recursive: true, force: true });
  }
  workerClient.setStructuralWorkerFactoryForTests(undefined);
  clearMockRuntime();
  session = undefined;
  cwd = undefined;
});

describe("public AST responsiveness", () => {
  it("advances the parent heartbeat while the Structural Worker blocks", async () => {
    cwd = mkdtempSync(join(tmpdir(), "code-find-worker-"));
    writeFileSync(join(cwd, "target.ts"), "export function target() {}\n");
    workerClient.setStructuralWorkerFactoryForTests(
      ({ generation }: { generation: number }) =>
        new Worker(
          new URL(
            "../../../supi-tree-sitter/src/worker/blocking-test-bootstrap.mjs",
            import.meta.url,
          ),
          {
            execArgv: [],
            workerData: { cwd, generation },
          },
        ),
    );
    const treeSitter = await import("../../../supi-tree-sitter/src/session/session.ts");
    session = treeSitter.createTreeSitterSession(cwd);
    getDefaultWorkspaceRuntime().registerStructural(
      cwd,
      createTreeSitterProvider(session as never),
    );
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_find");
    let ticks = 0;
    const heartbeat = setInterval(() => {
      ticks += 1;
    }, 10);
    try {
      const result = await tool.execute(
        "worker-heartbeat",
        { query: "target", mode: "ast", kind: "definition", scope: ["target.ts"] },
        undefined,
        undefined,
        makeCtx({ cwd }),
      );
      expect(result).toBeDefined();
      expect(ticks).toBeGreaterThanOrEqual(5);
    } finally {
      clearInterval(heartbeat);
    }
  });
});
