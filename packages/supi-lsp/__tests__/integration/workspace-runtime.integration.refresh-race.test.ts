import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { Diagnostic, LspConfig } from "../../src/config/types.ts";
import { LspManager } from "../../src/manager/manager.ts";
import { createWorkspaceLspRuntimeOwner } from "../../src/session/runtime-registry.ts";
import { waitFor } from "../helpers/integration-utils.ts";

const FIXTURE = path.resolve(import.meta.dirname, "../fixtures/lsp-semantic-server.mjs");
const RESPONSE_DELAY_MS = 200;

type LogEntry = { method: string; params?: unknown };
type Workspace = ReturnType<typeof createWorkspace>;

function createConfig(logPath: string): LspConfig {
  return {
    servers: {
      fixture: {
        command: process.execPath,
        args: [FIXTURE, logPath, String(RESPONSE_DELAY_MS), "pull"],
        fileTypes: ["test"],
        rootMarkers: ["project.marker"],
      },
    },
  };
}

function createWorkspace(dependencyContent: string): {
  cwd: string;
  dependency: string;
  consumer: string;
  logPath: string;
  owner: ReturnType<typeof createWorkspaceLspRuntimeOwner>;
} {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-runtime-refresh-race-"));
  const dependency = path.join(cwd, "dependency.test");
  const consumer = path.join(cwd, "consumer.test");
  const logPath = path.join(cwd, "server.log");
  fs.writeFileSync(path.join(cwd, "project.marker"), "");
  fs.writeFileSync(dependency, dependencyContent);
  fs.writeFileSync(consumer, "consumer-v1");
  fs.writeFileSync(logPath, "");
  const owner = createWorkspaceLspRuntimeOwner(new LspManager(createConfig(logPath), cwd));
  return { cwd, dependency, consumer, logPath, owner };
}

function readLog(logPath: string): LogEntry[] {
  const content = fs.readFileSync(logPath, "utf-8").trim();
  return content ? content.split("\n").map((line) => JSON.parse(line) as LogEntry) : [];
}

function hasDiagnostic(result: { kind: string; data?: Diagnostic[] }): boolean {
  return (
    (result.kind === "completed" || result.kind === "partial") && (result.data?.length ?? 0) > 0
  );
}

async function waitForDependencyChange(logPath: string, content: string): Promise<void> {
  await waitFor(
    async () => readLog(logPath),
    (entries) =>
      entries.some(
        (entry) =>
          entry.method === "textDocument/didChange" &&
          JSON.stringify(entry.params).includes(content),
      ),
    { timeoutMs: 5_000, retryDelayMs: 5, label: `dependency synchronization for ${content}` },
  );
}

type DiagnosticResult = Awaited<ReturnType<Workspace["owner"]["runtime"]["fileDiagnostics"]>>;
type RefreshEvidence = Awaited<ReturnType<Workspace["owner"]["runtime"]["refreshOpenDiagnostics"]>>;

async function runOverlap(
  initialDependency: string,
  changedDependency: string,
  initialHasDiagnostic: boolean,
): Promise<{
  during: DiagnosticResult;
  after: DiagnosticResult;
  refreshEvidence: RefreshEvidence;
}> {
  const workspace = createWorkspace(initialDependency);
  const { dependency, consumer, logPath, owner } = workspace;
  try {
    await owner.runtime.trackFile(dependency);
    await owner.runtime.trackFile(consumer);
    const initial = await owner.runtime.fileDiagnostics(consumer);
    expect(hasDiagnostic(initial)).toBe(initialHasDiagnostic);

    fs.writeFileSync(dependency, changedDependency);
    fs.writeFileSync(logPath, "");
    let refreshSettled = false;
    const refresh = owner.runtime
      .refreshOpenDiagnostics({ maxWaitMs: 1_500, quietMs: 1 })
      .finally(() => {
        refreshSettled = true;
      });

    await waitForDependencyChange(logPath, changedDependency);
    expect(refreshSettled).toBe(false);
    const during = await owner.runtime.fileDiagnostics(consumer);
    const refreshEvidence = await refresh;
    const after = await owner.runtime.fileDiagnostics(consumer);

    const dependencyChanges = readLog(logPath).filter(
      (entry) => entry.method === "textDocument/didChange",
    );
    expect(dependencyChanges).toHaveLength(1);
    expect(JSON.stringify(dependencyChanges[0]?.params)).toContain(changedDependency);
    return { during, after, refreshEvidence };
  } finally {
    await owner.shutdown();
    fs.rmSync(workspace.cwd, { recursive: true, force: true });
  }
}

describe("public WorkspaceLspRuntime refresh and exact diagnostics race", () => {
  it("does not confirm a clean dependent during clean-to-error refresh", async () => {
    const { during, after, refreshEvidence } = await runOverlap(
      "dependency-v1",
      "dependency-v2",
      false,
    );

    expect(refreshEvidence).toMatchObject({ requested: 2, confirmed: 2, unconfirmed: 0 });
    expect(during.kind === "unavailable" || hasDiagnostic(during)).toBe(true);
    expect(after.kind === "unavailable" || hasDiagnostic(after)).toBe(true);
  });

  it("does not retain an old error during error-to-clean refresh", async () => {
    const { during, after, refreshEvidence } = await runOverlap(
      "dependency-v2",
      "dependency-v1",
      true,
    );

    expect(refreshEvidence).toMatchObject({ requested: 2, confirmed: 2, unconfirmed: 0 });
    expect(during.kind === "unavailable" || !hasDiagnostic(during)).toBe(true);
    expect(
      after.kind === "unavailable" || (after.kind === "completed" && after.data.length === 0),
    ).toBe(true);
  });
});
