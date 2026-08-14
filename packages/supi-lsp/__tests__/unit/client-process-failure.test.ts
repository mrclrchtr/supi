import type { ChildProcess, spawn as spawnType } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  diagnosticRequests: 0,
  transports: [] as Array<{ disposed: boolean }>,
}));

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
  spawn: mocks.spawn,
}));

vi.mock("../../src/client/transport.ts", () => ({
  JsonRpcClient: class {
    readonly state = { disposed: false };

    constructor() {
      mocks.transports.push(this.state);
    }

    async sendRequest(method: string) {
      if (method === "initialize") {
        return {
          capabilities: {
            diagnosticProvider: { interFileDependencies: false, workspaceDiagnostics: false },
          },
        };
      }
      if (method === "textDocument/diagnostic") {
        mocks.diagnosticRequests++;
        return new Promise(() => {});
      }
      return null;
    }

    async sendNotification() {}
    onNotification() {}
    onRequest() {}

    dispose() {
      this.state.disposed = true;
    }
  },
  JsonRpcRequestError: class extends Error {
    readonly code = -1;
  },
}));

import { LspClient } from "../../src/client/client.ts";

function createProcess(): ChildProcess {
  return Object.assign(new EventEmitter(), {
    stdin: {},
    stdout: {},
    stderr: new EventEmitter(),
    pid: 42_000,
    exitCode: null,
    kill: vi.fn(),
  }) as unknown as ChildProcess;
}

function timeoutAfter(ms: number): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timed out")), ms));
}

describe("LspClient process failure", () => {
  let process: ChildProcess;
  let directory = "";

  beforeEach(() => {
    process = createProcess();
    mocks.spawn.mockReturnValue(process as ReturnType<typeof spawnType>);
    mocks.diagnosticRequests = 0;
    mocks.transports.length = 0;
  });

  afterEach(() => {
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = "";
    vi.clearAllMocks();
  });

  it("publishes startup after the initialize handshake", async () => {
    const transitions: string[] = [];
    const client = new LspClient(
      "test",
      { command: "test-lsp", fileTypes: ["ts"], rootMarkers: ["package.json"] },
      "/project",
      (kind) => transitions.push(kind),
    );

    await client.start();

    expect(transitions).toEqual(["startup"]);
  });

  it("releases a pending file diagnostic waiter when the server process fails", async () => {
    const client = new LspClient(
      "test",
      { command: "test-lsp", fileTypes: ["ts"], rootMarkers: ["package.json"] },
      "/project",
    );
    await client.start();
    (client as unknown as { resolveReady(): void }).resolveReady();
    const pending = client.syncAndWaitForDiagnostics("/project/pending.ts", "const value = 1;");
    await vi.waitFor(() => expect(mocks.diagnosticRequests).toBe(1));

    process.emit("error", new Error("server failed"));

    await expect(Promise.race([pending, timeoutAfter(250)])).resolves.toMatchObject({
      kind: "unavailable",
    });
    expect(client.status).toBe("error");
    expect(mocks.transports[0]?.disposed).toBe(true);
  });

  it("keeps a failed document as removed when the file is deleted", async () => {
    directory = mkdtempSync(join(tmpdir(), "lsp-process-failure-"));
    const file = join(directory, "deleted-after-failure.ts");
    writeFileSync(file, "const value = 1;\n");
    const client = new LspClient(
      "test",
      { command: "test-lsp", fileTypes: ["ts"], rootMarkers: ["package.json"] },
      directory,
    );
    await client.start();
    (client as unknown as { resolveReady(): void }).resolveReady();
    client.didOpen(file, "const value = 1;\n");

    process.emit("exit", 1);
    rmSync(file);

    expect(client.getDiagnosticSnapshot()).toMatchObject({
      documents: [{ uri: `file://${file}`, status: "removed", current: false }],
      current: false,
    });
  });

  it("keeps a cache-only document as removed after a process failure", async () => {
    directory = mkdtempSync(join(tmpdir(), "lsp-process-failure-"));
    const file = join(directory, "related-after-failure.ts");
    writeFileSync(file, "const value = 1;\n");
    const client = new LspClient(
      "test",
      { command: "test-lsp", fileTypes: ["ts"], rootMarkers: ["package.json"] },
      directory,
    );
    await client.start();
    client.handlePublishDiagnostics({ uri: `file://${file}`, diagnostics: [] });

    process.emit("exit", 1);
    rmSync(file);

    expect(client.getDiagnosticSnapshot()).toMatchObject({
      documents: [{ uri: `file://${file}`, status: "removed", current: false }],
      current: false,
    });
  });

  it("releases a diagnostic settle timer when the server exits", async () => {
    directory = mkdtempSync(join(tmpdir(), "lsp-process-failure-"));
    const file = join(directory, "pending.ts");
    writeFileSync(file, "const value = 1;\n");
    const client = new LspClient(
      "test",
      { command: "test-lsp", fileTypes: ["ts"], rootMarkers: ["package.json"] },
      directory,
    );
    await client.start();
    (client as unknown as { resolveReady(): void }).resolveReady();
    client.didOpen(file, "const value = 1;\n");
    const pending = client.refreshOpenDiagnostics({ maxWaitMs: 1_000, quietMs: 500 });
    await vi.waitFor(() => expect(mocks.diagnosticRequests).toBe(1));

    process.emit("exit", 1);

    await expect(Promise.race([pending, timeoutAfter(250)])).resolves.toMatchObject({
      requested: 1,
      failed: 1,
      removed: 0,
    });
    expect(client.status).toBe("error");
    expect(client.getDiagnosticSnapshot()).toMatchObject({
      documents: [{ uri: `file://${file}`, status: "failed", current: false }],
      current: false,
    });
  });
});
