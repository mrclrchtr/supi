import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { CodeRequestDeadlineError } from "@mrclrchtr/supi-code-runtime/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const clients: Array<{
    status: string;
    openFiles: string[];
    openContents?: Map<string, string>;
    failedFiles?: Set<string>;
  }> = [];
  const recordDebugEvent = vi.fn();
  const startBehaviors: Array<() => void | Promise<void>> = [];

  class FakeClient {
    readonly name: string;
    readonly root: string;
    readonly serverCapabilities = null;
    readonly openContents = new Map<string, string>();
    readonly failedFiles = new Set<string>();
    status: "initializing" | "running" | "error" | "shutdown" = "initializing";
    ready = false;
    openFiles: string[] = [];

    constructor(
      name: string,
      _config: unknown,
      root: string,
      private readonly listener?: (kind: string) => void,
    ) {
      this.name = name;
      this.root = root;
      clients.push(this);
    }

    async start(): Promise<void> {
      const behavior = startBehaviors.shift();
      if (behavior) {
        try {
          await behavior();
        } catch (error) {
          this.status = "error";
          this.listener?.("crash");
          throw error;
        }
      }
      if (this.status === "shutdown") throw new Error("client shut down during start");
      this.status = "running";
      this.listener?.("startup");
    }

    async shutdown(): Promise<void> {
      this.status = "shutdown";
      this.ready = false;
      this.listener?.("shutdown");
    }

    dispose(): void {
      this.ready = false;
    }

    forceKill(): Promise<void> {
      return Promise.resolve();
    }

    becomeReady(): void {
      this.ready = true;
      this.listener?.("readiness");
    }

    crash(): void {
      this.status = "error";
      this.ready = false;
      this.listener?.("crash");
    }

    didOpen(file: string, content: string): void {
      if (!this.openFiles.includes(file)) this.openFiles.push(file);
      this.openContents.set(file, content);
      this.listener?.("tracked-files");
    }

    getDiagnosticSnapshot(): {
      entries: [];
      documents: Array<{ uri: string; current: false; status: "failed" }>;
      current: false;
    } {
      return {
        entries: [],
        documents: this.openFiles.map((file) => ({
          uri: `file://${file}`,
          current: false,
          status: "failed" as const,
        })),
        current: false,
      };
    }

    getRecoveryStallSignal(): null {
      return null;
    }

    getOpenDocumentVersion(): null {
      return null;
    }

    getDiagnostics(): [] {
      return [];
    }

    clearPullResultIds(): void {}

    markFailedFile(file: string): void {
      this.failedFiles.add(file);
    }
  }

  return { clients, FakeClient, recordDebugEvent, startBehaviors };
});

type FakeClient = InstanceType<typeof mocks.FakeClient>;

vi.mock("@mrclrchtr/supi-core/debug", () => ({
  recordDebugEvent: mocks.recordDebugEvent,
  truncateDebugIdentity: (value: string) => value,
}));

vi.mock("../../src/client/client.ts", () => ({
  LspClient: mocks.FakeClient,
  RECOVERY_CLIENT_STARTUP_BOUND_MS: 5_000,
  withTimeout: async <T>(operation: Promise<T>) => operation,
}));

import type { LspConfig } from "../../src/config/types.ts";
import { LspManager } from "../../src/manager/manager.ts";

const config: LspConfig = {
  servers: {
    test: {
      command: process.execPath,
      fileTypes: ["test"],
      rootMarkers: [],
    },
  },
};

const tempRoots: string[] = [];
const managers: LspManager[] = [];

function createProject(): { root: string; file: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-process-recovery-"));
  const file = path.join(root, "tracked.test");
  fs.writeFileSync(file, "current disk content\n");
  tempRoots.push(root);
  return { root, file };
}

async function startAndCrash(options: { includeMissingFile?: boolean } = {}): Promise<{
  manager: LspManager;
  root: string;
  file: string;
  missingFile?: string;
  original: FakeClient;
}> {
  const { root, file } = createProject();
  const missingFile = options.includeMissingFile ? path.join(root, "missing.test") : undefined;
  if (missingFile) fs.writeFileSync(missingFile, "missing before crash\n");
  const manager = new LspManager(config, root);
  managers.push(manager);
  const original = await manager.startServerForRoot("test", root);
  if (!original) throw new Error("Expected the original client.");
  const fakeOriginal = original as unknown as FakeClient;
  fakeOriginal.becomeReady();
  fakeOriginal.didOpen(file, "old process content\n");
  if (missingFile) fakeOriginal.didOpen(missingFile, "missing before crash\n");
  fakeOriginal.crash();
  if (missingFile) fs.rmSync(missingFile);
  return { manager, root, file, missingFile, original: fakeOriginal };
}

afterEach(async () => {
  await Promise.all(managers.splice(0).map((manager) => manager.shutdownAll()));
  for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  mocks.clients.length = 0;
  mocks.startBehaviors.length = 0;
  mocks.recordDebugEvent.mockClear();
});

beforeEach(() => {
  mocks.clients.length = 0;
  mocks.startBehaviors.length = 0;
});

describe("LspManager process-crash recovery", () => {
  it("recovers on the next routed operation and restores current disk content", async () => {
    const { manager, root, file } = await startAndCrash();
    const start = deferred<void>();
    mocks.startBehaviors.push(() => start.promise);

    const first = manager.getClientForFile(file, { recoverProcessCrash: true });
    const second = manager.getClientForFile(file, { recoverProcessCrash: true });
    await vi.waitFor(() => expect(mocks.clients).toHaveLength(2));

    expect(manager.getProjectServerInfo("test", root, ["test"])).toMatchObject({
      status: "error",
      statusReason: "process-crash-recovery-pending",
    });

    start.resolve();
    const [firstClient, secondClient] = await Promise.all([first, second]);
    expect(firstClient).toBe(secondClient);
    expect(firstClient).toBe(mocks.clients[1]);
    expect(mocks.clients[1]?.openContents?.get(file)).toBe("current disk content\n");
    expect(manager.getProjectServerInfo("test", root, ["test"]).status).toBe("running");
    expect(manager.getProjectServerInfo("test", root, ["test"])).not.toHaveProperty("statusReason");
    await expect(manager.getClientForFile(file)).resolves.toBe(firstClient);
    expect(mocks.recordDebugEvent.mock.calls.map(([event]) => event.data?.outcome)).toEqual([
      "attempt",
      "success",
    ]);
  });

  it("keeps failed evidence for a document that cannot be restored", async () => {
    const { manager, file, missingFile } = await startAndCrash({ includeMissingFile: true });
    if (!missingFile) throw new Error("Expected a missing test file.");
    mocks.startBehaviors.push(() => undefined);

    const replacement = await manager.getClientForFile(file, { recoverProcessCrash: true });
    if (!replacement) throw new Error("Expected the replacement client.");
    const fakeReplacement = replacement as unknown as FakeClient;

    expect(fakeReplacement.failedFiles).toContain(missingFile);
    expect(fakeReplacement.openContents.get(file)).toBe("current disk content\n");
  });

  it("lets a cancelled caller detach while the shared replacement continues", async () => {
    const { manager, file } = await startAndCrash();
    const start = deferred<void>();
    mocks.startBehaviors.push(() => start.promise);
    const controller = new AbortController();

    const cancelled = manager.getClientForFile(file, {
      recoverProcessCrash: true,
      control: { signal: controller.signal },
    });
    await vi.waitFor(() => expect(mocks.clients).toHaveLength(2));
    const later = manager.getClientForFile(file, { recoverProcessCrash: true });

    controller.abort(new Error("caller cancelled"));
    await expect(cancelled).rejects.toThrow("caller cancelled");
    expect(mocks.clients).toHaveLength(2);

    start.resolve();
    await expect(later).resolves.toBe(mocks.clients[1]);
    expect(mocks.clients).toHaveLength(2);
  });

  it("lets a caller deadline detach while the shared replacement continues", async () => {
    const { manager, file } = await startAndCrash();
    const start = deferred<void>();
    mocks.startBehaviors.push(() => start.promise);

    const timedOut = manager.getClientForFile(file, {
      recoverProcessCrash: true,
      control: { deadline: Date.now() + 25 },
    });
    const timedOutAssertion = expect(timedOut).rejects.toBeInstanceOf(CodeRequestDeadlineError);
    await vi.waitFor(() => expect(mocks.clients).toHaveLength(2));
    await new Promise((resolve) => setTimeout(resolve, 50));

    await timedOutAssertion;
    const later = manager.getClientForFile(file, { recoverProcessCrash: true });
    start.resolve();
    await expect(later).resolves.toBe(mocks.clients[1]);
    expect(mocks.clients).toHaveLength(2);
  });

  it("exhausts the route after replacement startup fails", async () => {
    const { manager, root, file } = await startAndCrash();
    mocks.startBehaviors.push(async () => {
      throw new Error("replacement failed");
    });

    await expect(manager.getClientForFile(file, { recoverProcessCrash: true })).resolves.toBeNull();
    expect(manager.getProjectServerInfo("test", root, ["test"])).toMatchObject({
      status: "error",
      statusReason: "process-crash-recovery-exhausted",
    });
    await expect(manager.getClientForFile(file, { recoverProcessCrash: true })).resolves.toBeNull();
    expect(mocks.clients).toHaveLength(2);
    expect(mocks.recordDebugEvent.mock.calls.map(([event]) => event.data?.outcome)).toEqual([
      "attempt",
      "failure",
    ]);
  });

  it("does not start another replacement after a later process crash", async () => {
    const { manager, root, file } = await startAndCrash();
    mocks.startBehaviors.push(() => undefined);
    const replacement = await manager.getClientForFile(file, { recoverProcessCrash: true });
    if (!replacement) throw new Error("Expected the replacement client.");
    const fakeReplacement = replacement as unknown as FakeClient;

    const replacementOnlyFile = path.join(root, "opened-after-recovery.test");
    fs.writeFileSync(replacementOnlyFile, "replacement-only content\n");
    fakeReplacement.didOpen(replacementOnlyFile, "replacement-only content\n");
    fakeReplacement.crash();

    expect(manager.getProjectServerInfo("test", root, ["test"])).toMatchObject({
      status: "error",
      statusReason: "process-crash-recovery-exhausted",
    });
    await expect(manager.getClientForFile(file, { recoverProcessCrash: true })).resolves.toBeNull();
    expect(mocks.clients).toHaveLength(2);
    expect(mocks.recordDebugEvent.mock.calls.map(([event]) => event.data?.outcome)).toEqual([
      "attempt",
      "success",
      "exhausted",
    ]);

    expect(manager.canServeFile(file)).toBe(false);
    const diagnostics = await manager.recoverWorkspaceDiagnostics({
      restartIfStillStale: false,
      processCrashDemand: { scopes: [replacementOnlyFile] },
    });
    expect(diagnostics.refreshFailureReason).toContain("process recovery exhausted");
    expect(diagnostics.diagnosticEvidence.documents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: path.relative(root, replacementOnlyFile),
          status: "failed",
        }),
      ]),
    );
  });

  it("does not restart from passive operations", async () => {
    const { manager, file } = await startAndCrash();
    const initialClientCount = mocks.clients.length;

    await expect(manager.getClientForFile(file)).resolves.toBeNull();
    await expect(manager.waitUntilWorkspaceReady()).resolves.toBe(0);
    await expect(manager.refreshOpenDiagnostics()).resolves.toMatchObject({ failed: 1 });

    expect(mocks.clients).toHaveLength(initialClientCount);
    expect(manager.getProjectServerInfo("test", manager.getCwd(), ["test"])).toMatchObject({
      statusReason: "process-crashed",
    });
  });

  it("keeps initial startup failure outside process-crash recovery", async () => {
    const { root, file } = createProject();
    const manager = new LspManager(config, root);
    managers.push(manager);
    mocks.startBehaviors.push(async () => {
      throw new Error("initialization failed");
    });

    await expect(manager.startServerForRoot("test", root)).resolves.toBeNull();
    expect(manager.getProjectServerInfo("test", root, ["test"]).status).toBe("error");
    expect(manager.getProjectServerInfo("test", root, ["test"])).not.toHaveProperty("statusReason");
    await expect(manager.getClientForFile(file, { recoverProcessCrash: true })).resolves.toBeNull();
    await expect(manager.workspaceSymbol("tracked", undefined, [file])).resolves.toMatchObject({
      kind: "unavailable",
    });
    expect(mocks.clients).toHaveLength(1);
    expect(mocks.recordDebugEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ category: "runtime.recovery" }),
    );
  });

  it("stops a pending replacement when the owner shuts down", async () => {
    const { manager, file } = await startAndCrash();
    const start = deferred<void>();
    mocks.startBehaviors.push(() => start.promise);
    const recovery = manager.getClientForFile(file, { recoverProcessCrash: true });
    await vi.waitFor(() => expect(mocks.clients).toHaveLength(2));

    await manager.shutdownAll();
    start.resolve();

    await expect(recovery).resolves.toBeNull();
    expect(mocks.clients[1]?.status).toBe("shutdown");
    expect(manager.getProjectServerInfo("test", "/unused", ["test"]).statusReason).toBeUndefined();
  });
});

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
