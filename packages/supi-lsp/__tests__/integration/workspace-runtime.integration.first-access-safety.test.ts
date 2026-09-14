// Public runtime regressions for supersession cause monotonicity and caller control.

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
interface TestWorkspace {
  readonly cwd: string;
  readonly consumer: string;
  readonly enrolled: string;
  readonly logPath: string;
  readonly controller: LspRuntimeController;
  readonly runtime: WorkspaceLspRuntime;
}

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
          ...disabledDefaultServers(cwd),
        },
      },
    }),
  );
}

async function createWorkspace(): Promise<TestWorkspace> {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-runtime-first-access-safety-"));
  const consumer = path.join(cwd, "consumer.test");
  const enrolled = path.join(cwd, "enrolled.test");
  const logPath = path.join(cwd, "server.log");
  fs.writeFileSync(path.join(cwd, "project.marker"), "");
  fs.writeFileSync(consumer, "consumer-v1");
  fs.writeFileSync(enrolled, "enrolled-v1");
  fs.writeFileSync(logPath, "");
  writeProjectConfig(cwd, logPath);

  const controller = new LspRuntimeController(cwd);
  try {
    const started = await controller.start();
    if (started.kind !== "ready") {
      throw new Error(`Fixture LSP did not start: ${started.kind}`);
    }
    return { cwd, consumer, enrolled, logPath, controller, runtime: started.runtime };
  } catch (error) {
    await controller.shutdown();
    fs.rmSync(cwd, { recursive: true, force: true });
    throw error;
  }
}

async function prepareControlledWorkspace(): Promise<TestWorkspace> {
  const workspace = await createWorkspace();
  await expect(workspace.runtime.trackFile(workspace.consumer)).resolves.toBe(true);
  fsPromisesMock.readFile.mockImplementation((filePath: string) =>
    Promise.resolve(fs.readFileSync(filePath, "utf-8")),
  );
  await expect(workspace.runtime.waitUntilReadyForFile(workspace.consumer)).resolves.toMatchObject({
    kind: "ready",
  });
  fs.writeFileSync(workspace.logPath, "");
  return workspace;
}

function nextImmediate(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe("public WorkspaceLspRuntime first-access safety", () => {
  let reads: ControlledReads | undefined;
  let workspace: TestWorkspace | undefined;
  let pendingRequests: Promise<unknown>[] = [];

  beforeEach(() => {
    reads = new ControlledReads();
    fsPromisesMock.readFile.mockImplementation((filePath: string) =>
      Promise.resolve(fs.readFileSync(filePath, "utf-8")),
    );
  });

  afterEach(async () => {
    reads?.enableAutoResolve();
    await Promise.allSettled(pendingRequests);
    vi.useRealTimers();
    await workspace?.controller.shutdown();
    if (workspace) fs.rmSync(workspace.cwd, { recursive: true, force: true });
    fsPromisesMock.readFile.mockReset();
    pendingRequests = [];
    workspace = undefined;
    reads = undefined;
  });

  it("does not rejoin after content invalidation followed by enrollment", async () => {
    workspace = await prepareControlledWorkspace();
    const controlledReads = reads;
    if (!controlledReads) throw new Error("Controlled reads were not initialized.");
    fsPromisesMock.readFile.mockImplementation((filePath: string) =>
      controlledReads.read(filePath),
    );

    const pending = workspace.runtime.hover(workspace.consumer, { line: 0, character: 0 });
    pendingRequests.push(pending);
    await controlledReads.waitForCalls(1);
    workspace.runtime.noteWorkspaceChanges([
      { uri: fileToUri(workspace.consumer), type: FileChangeType.Changed },
    ]);
    await expect(workspace.runtime.trackFile(workspace.enrolled)).resolves.toBe(true);

    controlledReads.resolveAll();
    controlledReads.enableAutoResolve();
    await expect(pending).resolves.toMatchObject({ kind: "unavailable" });
    expect(controlledReads.calls).toHaveLength(1);
    expect(readLog(workspace.logPath)).not.toContainEqual(
      expect.objectContaining({ method: "textDocument/didChange" }),
    );
  });

  it("keeps enrollment supersession non-retryable after later content invalidation", async () => {
    workspace = await prepareControlledWorkspace();
    const controlledReads = reads;
    if (!controlledReads) throw new Error("Controlled reads were not initialized.");
    fsPromisesMock.readFile.mockImplementation((filePath: string) =>
      controlledReads.read(filePath),
    );

    const pending = workspace.runtime.hover(workspace.consumer, { line: 0, character: 0 });
    pendingRequests.push(pending);
    await controlledReads.waitForCalls(1);
    await expect(workspace.runtime.trackFile(workspace.enrolled)).resolves.toBe(true);
    workspace.runtime.noteWorkspaceChanges([
      { uri: fileToUri(workspace.consumer), type: FileChangeType.Changed },
    ]);

    controlledReads.resolveAll();
    controlledReads.enableAutoResolve();
    await expect(pending).resolves.toMatchObject({ kind: "unavailable" });
    expect(controlledReads.calls).toHaveLength(1);
  });

  it("preserves cancellation during enrollment rejoin and owns the old reader until settlement", async () => {
    workspace = await prepareControlledWorkspace();
    const controlledReads = reads;
    if (!controlledReads) throw new Error("Controlled reads were not initialized.");
    fsPromisesMock.readFile.mockImplementation((filePath: string) =>
      controlledReads.read(filePath),
    );

    const caller = new AbortController();
    const pending = workspace.runtime.hover(
      workspace.consumer,
      { line: 0, character: 0 },
      { signal: caller.signal },
    );
    const outcome = pending.then(
      (value) => ({ status: "fulfilled" as const, value }),
      (reason: unknown) => ({ status: "rejected" as const, reason }),
    );
    pendingRequests.push(outcome);
    await controlledReads.waitForCalls(1);
    await expect(workspace.runtime.trackFile(workspace.enrolled)).resolves.toBe(true);
    await nextImmediate();

    caller.abort(new Error("enrollment rejoin cancelled"));
    await expect(outcome).resolves.toMatchObject({
      status: "rejected",
      reason: { message: "enrollment rejoin cancelled" },
    });
    expect(controlledReads.calls).toHaveLength(1);
    expect(controlledReads.activeReads).toBe(1);

    controlledReads.resolveAll();
    await nextImmediate();
    expect(controlledReads.activeReads).toBe(0);
  });

  it("preserves the exact deadline during enrollment rejoin and owns the old reader until settlement", async () => {
    workspace = await prepareControlledWorkspace();
    const controlledReads = reads;
    if (!controlledReads) throw new Error("Controlled reads were not initialized.");
    fsPromisesMock.readFile.mockImplementation((filePath: string) =>
      controlledReads.read(filePath),
    );

    const baseTime = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(baseTime);
    const pending = workspace.runtime.hover(
      workspace.consumer,
      { line: 0, character: 0 },
      { deadline: baseTime + 10 },
    );
    const outcome = pending.then(
      (value) => ({ status: "fulfilled" as const, value }),
      (reason: unknown) => ({ status: "rejected" as const, reason }),
    );
    pendingRequests.push(outcome);
    await controlledReads.waitForCalls(1);
    await expect(workspace.runtime.trackFile(workspace.enrolled)).resolves.toBe(true);
    await vi.runAllTicks();
    await vi.advanceTimersByTimeAsync(10);

    await expect(outcome).resolves.toMatchObject({
      status: "rejected",
      reason: { message: "Code request deadline exceeded" },
    });
    expect(controlledReads.calls).toHaveLength(1);
    expect(controlledReads.activeReads).toBe(1);

    controlledReads.resolveAll();
    await vi.runAllTicks();
    expect(controlledReads.activeReads).toBe(0);
  });
});

function readLog(logPath: string): Array<{ method: string; params?: unknown }> {
  const content = fs.readFileSync(logPath, "utf-8").trim();
  return content ? content.split("\n").map((line) => JSON.parse(line) as { method: string }) : [];
}
