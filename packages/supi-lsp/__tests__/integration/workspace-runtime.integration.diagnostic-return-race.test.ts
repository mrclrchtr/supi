// Public runtime regressions for diagnostic evidence invalidation at return time.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LspConfig } from "../../src/config/types.ts";
import { LspManager } from "../../src/manager/manager.ts";
import { createWorkspaceLspRuntimeOwner } from "../../src/session/runtime-registry.ts";
import { waitFor } from "../helpers/integration-utils.ts";

const fsPromisesMock = vi.hoisted(() => ({ readFile: vi.fn() }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, readFile: fsPromisesMock.readFile };
});

const FIXTURE = path.resolve(import.meta.dirname, "../fixtures/lsp-diagnostic-refresh-server.mjs");
const DOCUMENT_SYNC_METHODS = new Set([
  "textDocument/didChange",
  "textDocument/didClose",
  "textDocument/didOpen",
]);

type LogEntry = { method: string; params?: Record<string, unknown> };
type Workspace = ReturnType<typeof createWorkspace>;

class HeldInputRead {
  #filePath = "";
  #fileReads = 0;
  #releaseRead: (() => void) | undefined;
  #resolveEntered: (() => void) | undefined;
  #entered = Promise.resolve();

  holdFinalRead(filePath: string): void {
    this.#filePath = filePath;
    this.#fileReads = 0;
    this.#entered = new Promise<void>((resolve) => {
      this.#resolveEntered = resolve;
    });
    this.#releaseRead = undefined;
  }

  async read(filePath: string): Promise<string> {
    if (filePath === this.#filePath && ++this.#fileReads === 2) {
      const release = new Promise<void>((resolve) => {
        this.#releaseRead = resolve;
      });
      this.#resolveEntered?.();
      await release;
    }
    return fs.readFileSync(filePath, "utf8");
  }

  waitForFinalRead(): Promise<void> {
    return this.#entered;
  }

  release(): void {
    this.#releaseRead?.();
    this.#releaseRead = undefined;
  }
}

function createWorkspace(responseDelayMs = 150): {
  cwd: string;
  file: string;
  controlPath: string;
  logPath: string;
  owner: ReturnType<typeof createWorkspaceLspRuntimeOwner>;
} {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-runtime-diagnostic-race-"));
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

async function waitForLog(
  logPath: string,
  predicate: (entries: readonly LogEntry[]) => boolean,
  label: string,
): Promise<void> {
  await waitFor(async () => readLog(logPath), predicate, {
    timeoutMs: 5_000,
    retryDelayMs: 5,
    label,
  });
}

async function waitForRefresh(logPath: string, generation: number): Promise<void> {
  await waitForLog(
    logPath,
    (entries) =>
      entries.some(
        (entry) => entry.method === "test/refresh-sent" && entry.params?.generation === generation,
      ),
    `server refresh request ${generation}`,
  );
}

async function waitForDiagnosticPhase(
  logPath: string,
  method: "test/diagnostic-start" | "test/diagnostic-end",
  generation: number,
): Promise<void> {
  await waitForLog(
    logPath,
    (entries) =>
      entries.some((entry) => entry.method === method && entry.params?.generation === generation),
    `${method} generation ${generation}`,
  );
}

async function waitForDiagnosticMessage(workspace: Workspace, message: string): Promise<void> {
  await waitFor(
    async () => workspace.owner.runtime.getOutstandingDiagnostics(1),
    (snapshot) => snapshot.entries[0]?.diagnostics[0]?.message === message,
    { timeoutMs: 5_000, retryDelayMs: 5, label: `diagnostic ${message}` },
  );
}

function syncNotifications(logPath: string): LogEntry[] {
  return readLog(logPath).filter((entry) => DOCUMENT_SYNC_METHODS.has(entry.method));
}

describe("public runtime diagnostic evidence return race", () => {
  let reads: HeldInputRead;
  let workspace: Workspace | undefined;

  beforeEach(() => {
    reads = new HeldInputRead();
    fsPromisesMock.readFile.mockImplementation((filePath: string) => reads.read(filePath));
  });

  afterEach(async () => {
    reads.release();
    await workspace?.owner.shutdown();
    if (workspace) fs.rmSync(workspace.cwd, { recursive: true, force: true });
    workspace = undefined;
    fsPromisesMock.readFile.mockReset();
  });

  it("does not return cached clean evidence after server invalidation", async () => {
    workspace = createWorkspace(250);
    const { file, controlPath, logPath, owner } = workspace;
    await expect(owner.runtime.trackFile(file)).resolves.toBe(true);
    await expect(owner.runtime.fileDiagnostics(file)).resolves.toMatchObject({
      kind: "completed",
      data: [],
    });

    reads.holdFinalRead(file);
    const pending = owner.runtime.fileDiagnostics(file);
    await reads.waitForFinalRead();

    fs.writeFileSync(logPath, "");
    fs.writeFileSync(controlPath, "refresh");
    await waitForRefresh(logPath, 1);
    await waitForDiagnosticPhase(logPath, "test/diagnostic-start", 1);
    reads.release();

    const during = await pending;
    expect(during.kind).not.toBe("completed");
    await waitForDiagnosticPhase(logPath, "test/diagnostic-end", 1);
    await waitForDiagnosticMessage(workspace, "refresh-generation-1");
    await expect(owner.runtime.fileDiagnostics(file)).resolves.toMatchObject({
      kind: "completed",
      data: [expect.objectContaining({ message: "refresh-generation-1" })],
    });
    expect(syncNotifications(logPath)).toEqual([]);
  });

  it("does not return newly collected evidence after server invalidation", async () => {
    workspace = createWorkspace(250);
    const { file, controlPath, logPath, owner } = workspace;
    await expect(owner.runtime.trackFile(file)).resolves.toBe(true);

    reads.holdFinalRead(file);
    const pending = owner.runtime.fileDiagnostics(file);
    await reads.waitForFinalRead();
    await waitForDiagnosticPhase(logPath, "test/diagnostic-end", 0);

    fs.writeFileSync(logPath, "");
    fs.writeFileSync(controlPath, "refresh");
    await waitForRefresh(logPath, 1);
    await waitForDiagnosticPhase(logPath, "test/diagnostic-start", 1);
    reads.release();

    const during = await pending;
    expect(during.kind).not.toBe("completed");
    await waitForDiagnosticPhase(logPath, "test/diagnostic-end", 1);
    await waitForDiagnosticMessage(workspace, "refresh-generation-1");
    await expect(owner.runtime.fileDiagnostics(file)).resolves.toMatchObject({
      kind: "completed",
      data: [expect.objectContaining({ message: "refresh-generation-1" })],
    });
    expect(syncNotifications(logPath)).toEqual([]);
  });
});
