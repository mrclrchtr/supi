// Public runtime regressions for semantic input ownership and freshness.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileToUri } from "@mrclrchtr/supi-core/path";
import {
  FileChangeType,
  LspRuntimeController,
  type WorkspaceLspRuntime,
} from "@mrclrchtr/supi-lsp/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ControlledReads } from "../helpers/controlled-reads.ts";
import { disabledDefaultServers } from "../helpers/disabled-default-servers.ts";

const fsPromisesMock = vi.hoisted(() => ({ readFile: vi.fn() }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, readFile: fsPromisesMock.readFile };
});

const FIXTURE = path.resolve(import.meta.dirname, "../fixtures/lsp-semantic-server.mjs");

type LogEntry = { method: string; params?: unknown };

interface TestWorkspace {
  cwd: string;
  dependency: string;
  consumer: string;
  logPath: string;
  controller: LspRuntimeController;
  runtime: WorkspaceLspRuntime;
}

function writeProjectConfig(
  cwd: string,
  logPath: string,
  supportsDiagnostics = false,
  readinessDelayMs = 1,
): void {
  fs.mkdirSync(path.join(cwd, ".pi", "supi"), { recursive: true });
  fs.writeFileSync(
    path.join(cwd, ".pi", "supi", "config.json"),
    JSON.stringify({
      lsp: {
        servers: {
          fixture: {
            command: process.execPath,
            args: [
              FIXTURE,
              logPath,
              "10",
              ...(supportsDiagnostics ? ["pull"] : []),
              `--readiness-delay=${readinessDelayMs}`,
            ],
            fileTypes: ["test"],
            rootMarkers: ["project.marker"],
          },
          ...disabledDefaultServers(cwd),
        },
      },
    }),
  );
}

async function createWorkspace(
  supportsDiagnostics = false,
  readinessDelayMs = 1,
): Promise<TestWorkspace> {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-runtime-barrier-"));
  const dependency = path.join(cwd, "dependency.test");
  const consumer = path.join(cwd, "consumer.test");
  const logPath = path.join(cwd, "server.log");
  fs.writeFileSync(path.join(cwd, "project.marker"), "");
  fs.writeFileSync(dependency, "dependency-v1");
  fs.writeFileSync(consumer, "consumer-v1");
  fs.writeFileSync(logPath, "");
  writeProjectConfig(cwd, logPath, supportsDiagnostics, readinessDelayMs);

  const controller = new LspRuntimeController(cwd);
  try {
    const started = await controller.start();
    if (started.kind !== "ready") {
      throw new Error(`Fixture LSP did not start: ${started.kind}`);
    }
    return { cwd, dependency, consumer, logPath, controller, runtime: started.runtime };
  } catch (error) {
    await controller.shutdown();
    fs.rmSync(cwd, { recursive: true, force: true });
    throw error;
  }
}

function readLog(logPath: string): LogEntry[] {
  const content = fs.readFileSync(logPath, "utf-8").trim();
  return content ? content.split("\n").map((line) => JSON.parse(line) as LogEntry) : [];
}

describe("public WorkspaceLspRuntime input barrier", () => {
  let reads: ControlledReads;
  let workspace: TestWorkspace | undefined;

  beforeEach(() => {
    reads = new ControlledReads();
    fsPromisesMock.readFile.mockImplementation((filePath: string) => reads.read(filePath));
  });

  afterEach(async () => {
    reads.resolveAll();
    vi.useRealTimers();
    await workspace?.controller.shutdown();
    if (workspace) fs.rmSync(workspace.cwd, { recursive: true, force: true });
    workspace = undefined;
    fsPromisesMock.readFile.mockReset();
  });

  it("does not overlap a replacement after the only caller is cancelled", async () => {
    workspace = await createWorkspace();
    await workspace.runtime.trackFile(workspace.consumer);

    const firstController = new AbortController();
    const first = workspace.runtime.hover(
      workspace.consumer,
      { line: 0, character: 0 },
      { signal: firstController.signal },
    );
    await reads.waitForCalls(1);

    firstController.abort(new Error("first caller left"));
    await expect(first).rejects.toThrow("first caller left");

    const second = workspace.runtime.definition(workspace.consumer, { line: 0, character: 0 });
    expect(reads.activeReads).toBe(1);
    reads.resolveAll();

    await reads.waitForCalls(2);
    expect(reads.maximumActiveReads).toBe(1);
    reads.resolveAll();
    await reads.waitForCalls(3);
    reads.resolveAll();

    await expect(second).resolves.toMatchObject({ kind: "completed", data: [] });
    expect(reads.maximumActiveReads).toBe(1);
  });

  it("keeps a longer-deadline caller on the shared slow read", async () => {
    workspace = await createWorkspace(false, 100);
    await workspace.runtime.trackFile(workspace.consumer);

    // The public readiness operation also performs its documented semantic
    // warm-up. Use real reads for that protocol work before installing the
    // controlled reader used by the deadline race.
    fsPromisesMock.readFile.mockImplementation((filePath: string) =>
      fs.promises.readFile(filePath, "utf-8"),
    );
    await expect(
      workspace.runtime.waitUntilReadyForFile(workspace.consumer),
    ).resolves.toMatchObject({
      kind: "ready",
    });
    fsPromisesMock.readFile.mockImplementation((filePath: string) => reads.read(filePath));

    const baseTime = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(baseTime);

    const first = workspace.runtime.hover(
      workspace.consumer,
      { line: 0, character: 0 },
      { deadline: baseTime + 10 },
    );
    const firstOutcome = first.then(
      (value) => ({ status: "fulfilled" as const, value }),
      (reason: unknown) => ({ status: "rejected" as const, reason }),
    );
    await reads.waitForCalls(1);
    const second = workspace.runtime.definition(
      workspace.consumer,
      { line: 0, character: 0 },
      { deadline: baseTime + 10_000 },
    );
    const secondOutcome = second.then(
      (value) => ({ status: "fulfilled" as const, value }),
      (reason: unknown) => ({ status: "rejected" as const, reason }),
    );

    await vi.advanceTimersByTimeAsync(10);
    await expect(firstOutcome).resolves.toMatchObject({
      status: "rejected",
      reason: { message: "Code request deadline exceeded" },
    });
    expect(reads.calls).toHaveLength(1);
    expect(reads.activeReads).toBe(1);

    reads.resolveAll();
    await vi.runAllTicks();
    vi.useRealTimers();
    await reads.waitForCalls(2);
    reads.resolveAll();

    await expect(secondOutcome).resolves.toMatchObject({
      status: "fulfilled",
      value: { kind: "completed", data: [] },
    });
    expect(reads.maximumActiveReads).toBe(1);
  });

  it("waits for the old read after an input generation change", async () => {
    workspace = await createWorkspace();
    await workspace.runtime.trackFile(workspace.consumer);

    const first = workspace.runtime.hover(workspace.consumer, { line: 0, character: 0 });
    await reads.waitForCalls(1);
    const second = workspace.runtime.definition(workspace.consumer, { line: 0, character: 0 });
    workspace.runtime.noteWorkspaceChanges([
      { uri: fileToUri(workspace.consumer), type: FileChangeType.Changed },
    ]);

    expect(reads.calls).toHaveLength(1);
    reads.resolveAll();
    await expect(first).resolves.toMatchObject({ kind: "unavailable" });

    await reads.waitForCalls(2);
    expect(reads.maximumActiveReads).toBe(1);
    reads.resolveAll();
    await reads.waitForCalls(3);
    reads.resolveAll();

    await expect(second).resolves.toMatchObject({ kind: "completed", data: [] });
    expect(reads.maximumActiveReads).toBe(1);
  });

  it("shares the initial full-content pass for concurrent semantic callers", async () => {
    workspace = await createWorkspace();
    await workspace.runtime.trackFile(workspace.dependency);
    await workspace.runtime.trackFile(workspace.consumer);

    const first = workspace.runtime.hover(workspace.consumer, { line: 0, character: 0 });
    const second = workspace.runtime.definition(workspace.consumer, { line: 0, character: 0 });
    await reads.waitForCalls(2);
    expect(reads.calls).toHaveLength(2);
    expect(reads.activeReads).toBe(2);
    reads.enableAutoResolve();

    await expect(first).resolves.toMatchObject({ kind: "completed" });
    await expect(second).resolves.toMatchObject({ kind: "completed", data: [] });
    expect(reads.maximumActiveReads).toBe(2);
  });

  it("detects same-size content changes when mtime stays the same", async () => {
    workspace = await createWorkspace();
    await workspace.runtime.trackFile(workspace.dependency);
    await workspace.runtime.trackFile(workspace.consumer);
    const preservedMtime = new Date(1_600_000_000_000);
    fs.utimesSync(workspace.dependency, preservedMtime, preservedMtime);
    fs.writeFileSync(workspace.dependency, "dependency-v2");
    fs.utimesSync(workspace.dependency, preservedMtime, preservedMtime);
    expect(fs.statSync(workspace.dependency).mtimeMs).toBe(preservedMtime.getTime());
    fs.writeFileSync(workspace.logPath, "");

    const result = workspace.runtime.hover(workspace.consumer, { line: 0, character: 0 });
    await reads.waitForCalls(2);
    reads.resolveAll();
    await reads.waitForCalls(4);
    reads.resolveAll();

    await expect(result).resolves.toMatchObject({ kind: "completed" });
    const changes = readLog(workspace.logPath).filter(
      (entry) => entry.method === "textDocument/didChange",
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      params: {
        textDocument: { uri: fileToUri(workspace.dependency) },
        contentChanges: [{ text: "dependency-v2" }],
      },
    });
  });

  it("sends one verified change for a tracked non-authoritative diagnostic input", async () => {
    workspace = await createWorkspace(true);
    await workspace.runtime.trackFile(workspace.consumer);
    fs.writeFileSync(workspace.consumer, "consumer-v2");
    fs.writeFileSync(workspace.logPath, "");

    const result = workspace.runtime.fileDiagnostics(workspace.consumer);
    await reads.waitForCalls(1);
    // The manager has already read consumer-v2. Change the file while the
    // barrier is waiting so only its verified read may reach the server.
    fs.writeFileSync(workspace.consumer, "consumer-v3");
    reads.resolveAll();
    await reads.waitForCalls(2);
    reads.resolveAll();

    await expect(result).resolves.toMatchObject({ kind: "completed", data: [] });
    const changes = readLog(workspace.logPath).filter(
      (entry) => entry.method === "textDocument/didChange",
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      params: {
        textDocument: { uri: fileToUri(workspace.consumer) },
        contentChanges: [{ text: "consumer-v3" }],
      },
    });
  });
});
