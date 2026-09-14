import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { LspRuntimeController, type WorkspaceLspRuntime } from "@mrclrchtr/supi-lsp/api";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, describe, expect, it } from "vitest";
import type { CapabilityAdapter } from "../../../../src/session/capability-adapter.ts";
import { WorkspaceCodeIntelligenceSession } from "../../../../src/session/session.ts";
import { registerWorkspaceRecoveryHandler } from "../../../../src/substrate/lsp/recovery.ts";
import { createLspAdapterState } from "../../../../src/substrate/lsp/state.ts";
import { codeHealthSpec } from "../../../../src/tool/code_health/spec.ts";
import { registerCodeIntelligenceTools } from "../../../../src/tool/register.ts";

const FIXTURE = path.resolve(
  import.meta.dirname,
  "../../../../../supi-lsp/__tests__/fixtures/lsp-semantic-server.mjs",
);

type LogEntry = { method: string; params?: unknown };

function readLog(logPath: string): LogEntry[] {
  return fs
    .readFileSync(logPath, "utf-8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LogEntry);
}

const BUILT_IN_SERVERS = [
  "bash",
  "c",
  "go",
  "html",
  "java",
  "kotlin",
  "python",
  "r",
  "ruby",
  "rust",
  "sql",
  "typescript",
] as const;

function writeProjectConfig(cwd: string, logPath: string): void {
  fs.mkdirSync(path.join(cwd, ".pi", "supi"), { recursive: true });
  fs.writeFileSync(
    path.join(cwd, ".pi", "supi", "config.json"),
    JSON.stringify({
      lsp: {
        servers: {
          fixture: {
            command: process.execPath,
            args: [FIXTURE, logPath, "10", "pull"],
            fileTypes: ["test"],
            rootMarkers: ["project.marker"],
          },
          ...Object.fromEntries(BUILT_IN_SERVERS.map((name) => [name, { enabled: false }])),
        },
      },
    }),
  );
}

function createCapability(runtime: WorkspaceLspRuntime): CapabilityAdapter {
  return {
    getProviderState: () => ({ kind: "unavailable", reason: "not used" }),
    getProvider: () => null,
    getSemanticProvider: () => null,
    getStructuralProvider: () => null,
    getLspRuntimeState: () => ({ kind: "ready", runtime }),
    getCapabilityStates: () => ({
      semantic: { kind: "ready" },
      structural: { kind: "unavailable", reason: "not used" },
    }),
    ensureSemanticReadiness: async () => ({ kind: "ready" }),
  };
}

describe("Pi edit recovery through the public code tool", () => {
  let cwd: string | undefined;
  let shutdown: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await shutdown?.();
    shutdown = undefined;
    if (cwd) fs.rmSync(cwd, { recursive: true, force: true });
    cwd = undefined;
  });

  it("reports dependent diagnostics after edit completion and a semantic query", async () => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), "code-intelligence-recovery-"));
    const dependency = path.join(cwd, "dependency.test");
    const consumer = path.join(cwd, "consumer.test");
    const logPath = path.join(cwd, "server.log");
    fs.writeFileSync(path.join(cwd, "project.marker"), "");
    fs.writeFileSync(dependency, "dependency-v1");
    fs.writeFileSync(consumer, "consumer-v1");
    fs.writeFileSync(logPath, "");
    writeProjectConfig(cwd, logPath);

    const controller = new LspRuntimeController(cwd);
    const started = await controller.start();
    if (started.kind !== "ready") {
      throw new Error(`Fixture LSP did not start: ${started.kind}`);
    }
    shutdown = () => controller.shutdown();
    const runtime = started.runtime;
    await runtime.trackFile(dependency);
    await runtime.trackFile(consumer);

    const pi = createPiMock();
    const state = createLspAdapterState();
    state.controller = controller;
    registerWorkspaceRecoveryHandler(pi as never, state);
    const session = new WorkspaceCodeIntelligenceSession(cwd, createCapability(runtime));
    registerCodeIntelligenceTools(pi as never, () => session, undefined, [codeHealthSpec]);

    fs.writeFileSync(dependency, "dependency-v2");
    await pi.emit(
      "tool_result",
      { toolName: "edit", isError: false, input: { path: dependency } },
      makeCtx({ cwd }),
    );
    fs.writeFileSync(logPath, "");

    await expect(runtime.hover(consumer, { line: 0, character: 0 })).resolves.toMatchObject({
      kind: "completed",
    });
    const result = await getTool(pi, "code_health").execute(
      "health-after-edit",
      { scope: consumer, include: ["diagnostics"], level: "detailed" },
      undefined,
      undefined,
      makeCtx({ cwd }),
    );

    const methods = readLog(logPath).map((entry) => entry.method);
    expect(methods.indexOf("textDocument/didChange")).toBeGreaterThanOrEqual(0);
    expect(methods.indexOf("textDocument/hover")).toBeGreaterThan(
      methods.indexOf("textDocument/didChange"),
    );
    expect(methods.indexOf("textDocument/diagnostic")).toBeGreaterThan(
      methods.indexOf("textDocument/hover"),
    );
    expect(methods.filter((method) => method === "textDocument/didChange")).toHaveLength(1);
    expect(result).toMatchObject({ details: { type: "health" } });
    expect(JSON.stringify(result)).toContain(
      "Dependency content requires a changed consumer type.",
    );
  });
});
