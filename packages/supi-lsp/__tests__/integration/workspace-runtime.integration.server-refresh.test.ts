// Public WorkspaceLspRuntime server-requested diagnostic refresh regressions.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { LspConfig } from "../../src/config/types.ts";
import { LspManager } from "../../src/manager/manager.ts";
import { createWorkspaceLspRuntimeOwner } from "../../src/session/runtime-registry.ts";
import { waitFor } from "../helpers/integration-utils.ts";

const FIXTURE = path.resolve(import.meta.dirname, "../fixtures/lsp-diagnostic-refresh-server.mjs");
const DOCUMENT_SYNC_METHODS = new Set([
  "textDocument/didChange",
  "textDocument/didClose",
  "textDocument/didOpen",
]);

type LogEntry = { method: string; params?: Record<string, unknown> };
type Workspace = ReturnType<typeof createWorkspace>;

function createWorkspace(responseDelayMs = 150): {
  cwd: string;
  file: string;
  controlPath: string;
  logPath: string;
  owner: ReturnType<typeof createWorkspaceLspRuntimeOwner>;
} {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-runtime-server-refresh-"));
  const file = path.join(cwd, "refresh.test");
  const controlPath = path.join(cwd, "refresh.control");
  const logPath = path.join(cwd, "server.log");
  fs.writeFileSync(path.join(cwd, "project.marker"), "");
  fs.writeFileSync(file, "refresh-v1\n");
  fs.writeFileSync(controlPath, "");
  fs.writeFileSync(logPath, "");

  const config: LspConfig = {
    servers: {
      fixture: {
        command: process.execPath,
        args: [FIXTURE, logPath, controlPath, String(responseDelayMs)],
        fileTypes: ["test"],
        rootMarkers: ["project.marker"],
      },
    },
  };
  const owner = createWorkspaceLspRuntimeOwner(new LspManager(config, cwd));
  return { cwd, file, controlPath, logPath, owner };
}

function readLog(logPath: string): LogEntry[] {
  const content = fs.readFileSync(logPath, "utf8").trim();
  return content ? content.split("\n").map((line) => JSON.parse(line) as LogEntry) : [];
}

function diagnosticMessage(
  snapshot: ReturnType<Workspace["owner"]["runtime"]["getOutstandingDiagnostics"]>,
): string | undefined {
  const message = snapshot.entries[0]?.diagnostics[0]?.message;
  return typeof message === "string" ? message : undefined;
}

async function waitForRefresh(logPath: string, count: number): Promise<void> {
  await waitFor(
    async () => readLog(logPath),
    (entries) => entries.filter((entry) => entry.method === "test/refresh-sent").length >= count,
    { timeoutMs: 5_000, retryDelayMs: 5, label: `server refresh request ${count}` },
  );
}

async function waitForDiagnosticMessage(workspace: Workspace, message: string): Promise<void> {
  await waitFor(
    async () => workspace.owner.runtime.getOutstandingDiagnostics(1),
    (snapshot) => diagnosticMessage(snapshot) === message,
    { timeoutMs: 5_000, retryDelayMs: 5, label: `diagnostic ${message}` },
  );
}

function syncNotifications(logPath: string): LogEntry[] {
  return readLog(logPath).filter((entry) => DOCUMENT_SYNC_METHODS.has(entry.method));
}

function diagnosticStarts(logPath: string): LogEntry[] {
  return readLog(logPath).filter((entry) => entry.method === "test/diagnostic-start");
}

function diagnosticEnds(logPath: string): LogEntry[] {
  return readLog(logPath).filter((entry) => entry.method === "test/diagnostic-end");
}

describe("public WorkspaceLspRuntime server-requested diagnostic refresh", () => {
  let workspace: Workspace | undefined;

  afterEach(async () => {
    await workspace?.owner.shutdown();
    if (workspace) fs.rmSync(workspace.cwd, { recursive: true, force: true });
    workspace = undefined;
  });

  it("collects changed native diagnostics without no-op document synchronization", async () => {
    workspace = createWorkspace();
    const { file, controlPath, logPath, owner } = workspace;
    await expect(owner.runtime.trackFile(file)).resolves.toBe(true);
    await expect(owner.runtime.fileDiagnostics(file)).resolves.toMatchObject({
      kind: "completed",
      data: [],
    });

    fs.writeFileSync(logPath, "");
    fs.writeFileSync(controlPath, "refresh-1");
    await waitForRefresh(logPath, 1);
    await waitForDiagnosticMessage(workspace, "refresh-generation-1");

    const snapshot = owner.runtime.getOutstandingDiagnostics(1);
    expect(snapshot).toMatchObject({
      current: true,
      evidence: { requested: 1, confirmed: 1, unconfirmed: 0, failed: 0, removed: 0 },
    });
    expect(diagnosticMessage(snapshot)).toBe("refresh-generation-1");
    expect(syncNotifications(logPath)).toEqual([]);
    expect(diagnosticStarts(logPath)).toHaveLength(1);
    expect(diagnosticEnds(logPath)).toHaveLength(1);
  });

  it("coalesces a burst during an active pull and keeps the newest evidence", async () => {
    workspace = createWorkspace(250);
    const { file, controlPath, logPath, owner } = workspace;
    await expect(owner.runtime.trackFile(file)).resolves.toBe(true);
    await expect(owner.runtime.fileDiagnostics(file)).resolves.toMatchObject({
      kind: "completed",
      data: [],
    });

    fs.writeFileSync(logPath, "");
    fs.writeFileSync(controlPath, "refresh-1");
    await waitForRefresh(logPath, 1);
    await waitFor(
      async () => diagnosticStarts(logPath),
      (starts) => starts.length === 1,
      { timeoutMs: 5_000, retryDelayMs: 5, label: "active diagnostic pull" },
    );

    fs.writeFileSync(controlPath, "burst:2");
    await waitForRefresh(logPath, 3);
    await waitForDiagnosticMessage(workspace, "refresh-generation-3");

    const snapshot = owner.runtime.getOutstandingDiagnostics(1);
    expect(snapshot).toMatchObject({
      current: true,
      evidence: { requested: 1, confirmed: 1, unconfirmed: 0, failed: 0, removed: 0 },
    });
    expect(diagnosticMessage(snapshot)).toBe("refresh-generation-3");
    expect(syncNotifications(logPath)).toEqual([]);
    expect(diagnosticStarts(logPath)).toHaveLength(2);
    expect(diagnosticEnds(logPath)).toHaveLength(2);
    expect(diagnosticStarts(logPath).every((entry) => Number(entry.params?.maxActive) <= 1)).toBe(
      true,
    );
  });
});
