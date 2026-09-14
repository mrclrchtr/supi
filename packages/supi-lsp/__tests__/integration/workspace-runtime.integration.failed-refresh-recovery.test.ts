// Public runtime regressions for failed document reads during recovery.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { LspRuntimeController, type WorkspaceLspRuntime } from "@mrclrchtr/supi-lsp/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fsPromisesMock = vi.hoisted(() => ({ readFile: vi.fn() }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, readFile: fsPromisesMock.readFile };
});

const FIXTURE = path.resolve(import.meta.dirname, "../fixtures/lsp-semantic-server.mjs");
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
const DOCUMENT_SYNC_METHODS = new Set([
  "textDocument/didChange",
  "textDocument/didClose",
  "textDocument/didOpen",
]);

type LogEntry = { method: string; params?: unknown };

type TestWorkspace = {
  cwd: string;
  file: string;
  logPath: string;
  controller: LspRuntimeController;
  runtime: WorkspaceLspRuntime;
};

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

async function createWorkspace(): Promise<TestWorkspace> {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-runtime-failed-refresh-"));
  const file = path.join(cwd, "recovered.test");
  const logPath = path.join(cwd, "server.log");
  fs.writeFileSync(path.join(cwd, "project.marker"), "");
  fs.writeFileSync(file, "recovered-v1");
  fs.writeFileSync(logPath, "");
  writeProjectConfig(cwd, logPath);

  const controller = new LspRuntimeController(cwd);
  try {
    const started = await controller.start();
    if (started.kind !== "ready") {
      throw new Error(`Fixture LSP did not start: ${started.kind}`);
    }
    return { cwd, file, logPath, controller, runtime: started.runtime };
  } catch (error) {
    await controller.shutdown();
    fs.rmSync(cwd, { recursive: true, force: true });
    throw error;
  }
}

function readLog(logPath: string): LogEntry[] {
  const content = fs.readFileSync(logPath, "utf8").trim();
  return content ? content.split("\n").map((line) => JSON.parse(line) as LogEntry) : [];
}

function documentSyncNotifications(logPath: string): LogEntry[] {
  return readLog(logPath).filter((entry) => DOCUMENT_SYNC_METHODS.has(entry.method));
}

function diagnosticRequests(logPath: string): LogEntry[] {
  return readLog(logPath).filter((entry) => entry.method === "textDocument/diagnostic");
}

function expectFailedEvidence(runtime: WorkspaceLspRuntime): void {
  expect(runtime.getWorkspaceDiagnosticSummary()).toMatchObject({
    current: false,
    evidence: {
      confirmed: 0,
      unconfirmed: 0,
      failed: 1,
      removed: 0,
      documents: [expect.objectContaining({ status: "failed" })],
    },
  });
}

async function establishOpenFile(workspace: TestWorkspace): Promise<number> {
  await expect(workspace.runtime.trackFile(workspace.file)).resolves.toBe(true);
  await expect(workspace.runtime.fileDiagnostics(workspace.file)).resolves.toMatchObject({
    kind: "completed",
    data: [],
  });
  const version = workspace.runtime.getOpenDocumentVersion(workspace.file);
  if (version === null) throw new Error("Expected an open document version.");
  fs.writeFileSync(workspace.logPath, "");
  return version;
}

async function expectRecoveredEvidence(workspace: TestWorkspace, version: number): Promise<void> {
  await expect(
    workspace.runtime.refreshOpenDiagnostics({ maxWaitMs: 1_000, quietMs: 1 }),
  ).resolves.toMatchObject({
    requested: 1,
    confirmed: 1,
    unconfirmed: 0,
    failed: 0,
    removed: 0,
  });
  expect(workspace.runtime.getOpenDocumentVersion(workspace.file)).toBe(version);
  expect(documentSyncNotifications(workspace.logPath)).toEqual([]);
  expect(diagnosticRequests(workspace.logPath)).toHaveLength(1);
  expect(workspace.runtime.getWorkspaceDiagnosticSummary()).toMatchObject({
    current: true,
    evidence: {
      confirmed: 1,
      unconfirmed: 0,
      failed: 0,
      removed: 0,
      documents: [expect.objectContaining({ status: "confirmed" })],
    },
  });
}

describe("public WorkspaceLspRuntime failed-read recovery", () => {
  let workspace: TestWorkspace | undefined;

  beforeEach(() => {
    fsPromisesMock.readFile.mockImplementation((filePath: string) =>
      Promise.resolve(fs.readFileSync(filePath, "utf8")),
    );
  });

  afterEach(async () => {
    await workspace?.controller.shutdown();
    if (workspace) fs.rmSync(workspace.cwd, { recursive: true, force: true });
    workspace = undefined;
    fsPromisesMock.readFile.mockReset();
  });

  it("recovers a semantic-read failure without a no-op synchronization", async () => {
    workspace = await createWorkspace();
    const version = await establishOpenFile(workspace);

    fsPromisesMock.readFile.mockRejectedValueOnce(new Error("transient semantic read"));
    await expect(workspace.runtime.fileDiagnostics(workspace.file)).resolves.toMatchObject({
      kind: "unavailable",
    });
    expectFailedEvidence(workspace.runtime);

    fs.writeFileSync(workspace.file, "recovered-v1");
    await expectRecoveredEvidence(workspace, version);
  });

  it("sends one change when a failed semantic read recovers with new text", async () => {
    workspace = await createWorkspace();
    const version = await establishOpenFile(workspace);

    fsPromisesMock.readFile.mockRejectedValueOnce(new Error("transient semantic read"));
    await expect(workspace.runtime.fileDiagnostics(workspace.file)).resolves.toMatchObject({
      kind: "unavailable",
    });
    expectFailedEvidence(workspace.runtime);

    fs.writeFileSync(workspace.file, "recovered-v2");
    const recovery = await workspace.runtime.refreshOpenDiagnostics({
      maxWaitMs: 1_000,
      quietMs: 1,
    });

    expect(recovery).toMatchObject({
      requested: 1,
      confirmed: 1,
      unconfirmed: 0,
      failed: 0,
      removed: 0,
    });
    expect(workspace.runtime.getOpenDocumentVersion(workspace.file)).toBe(version + 1);
    const changes = documentSyncNotifications(workspace.logPath);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      method: "textDocument/didChange",
      params: { contentChanges: [{ text: "recovered-v2" }] },
    });
  });

  it("recovers a refresh-read failure without changing document identity", async () => {
    workspace = await createWorkspace();
    const version = await establishOpenFile(workspace);
    const savedFile = `${workspace.file}.saved`;
    fs.renameSync(workspace.file, savedFile);
    fs.mkdirSync(workspace.file);

    await expect(
      workspace.runtime.refreshOpenDiagnostics({ maxWaitMs: 100, quietMs: 1 }),
    ).resolves.toMatchObject({
      requested: 1,
      confirmed: 0,
      unconfirmed: 0,
      failed: 1,
      removed: 0,
    });
    expectFailedEvidence(workspace.runtime);

    fs.rmSync(workspace.file, { recursive: true, force: true });
    fs.renameSync(savedFile, workspace.file);
    await expectRecoveredEvidence(workspace, version);
  });
});
