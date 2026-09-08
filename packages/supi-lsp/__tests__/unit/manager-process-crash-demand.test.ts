import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const clients: FakeClientShape[] = [];
  const recordDebugEvent = vi.fn();
  const startBehaviors: Array<() => void | Promise<void>> = [];
  const readinessBehaviors: Array<() => void | Promise<void>> = [];

  interface FakeClientShape {
    name: string;
    root: string;
    status: "initializing" | "running" | "error" | "shutdown";
    ready: boolean;
    openFiles: string[];
  }

  class FakeClient implements FakeClientShape {
    readonly serverCapabilities = { workspaceSymbolProvider: true };
    readonly hasDiagnosticProvider = true;
    status: FakeClientShape["status"] = "initializing";
    ready = false;
    openFiles: string[] = [];

    constructor(
      readonly name: string,
      _config: unknown,
      readonly root: string,
      private readonly listener?: (kind: string) => void,
    ) {
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
      this.status = "running";
      this.listener?.("startup");
    }

    async getReady(): Promise<void> {
      const behavior = readinessBehaviors.shift();
      if (behavior) await behavior();
      if (!this.ready) throw new Error("The fake client is not ready.");
    }

    documentSymbols(): Promise<{ kind: "completed"; data: [] }> {
      return Promise.resolve({ kind: "completed", data: [] });
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

    didOpen(file: string): void {
      if (!this.openFiles.includes(file)) this.openFiles.push(file);
      this.listener?.("tracked-files");
    }

    workspaceSymbol(query: string): Promise<{
      kind: "completed";
      data: Array<{
        name: string;
        kind: number;
        location: {
          uri: string;
          range: {
            start: { line: number; character: number };
            end: { line: number; character: number };
          };
        };
      }>;
    }> {
      const file = this.openFiles[0] ?? path.join(this.root, "tracked.test");
      return Promise.resolve({
        kind: "completed",
        data: [
          {
            name: query,
            kind: 12,
            location: {
              uri: `file://${file}`,
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: query.length },
              },
            },
          },
        ],
      });
    }

    getDiagnosticSnapshot() {
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

    clearPullResultIds(): void {}
    notifyWorkspaceFileChanges(): void {}
    refreshOpenDiagnostics() {
      return Promise.resolve({
        requested: this.openFiles.length,
        confirmed: this.openFiles.length,
        unconfirmed: 0,
        failed: 0,
        removed: 0,
        documents: this.openFiles.map((file) => ({ file, status: "confirmed" as const })),
      });
    }

    markFailedFile(): void {}
    dispose(): void {
      this.ready = false;
    }
    forceKill(): Promise<void> {
      return Promise.resolve();
    }
    shutdown(): Promise<void> {
      this.status = "shutdown";
      return Promise.resolve();
    }
  }

  return { clients, FakeClient, readinessBehaviors, recordDebugEvent, startBehaviors };
});

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

beforeEach(() => {
  mocks.clients.length = 0;
  mocks.readinessBehaviors.length = 0;
  mocks.startBehaviors.length = 0;
  mocks.recordDebugEvent.mockClear();
});

afterEach(async () => {
  await Promise.all(managers.splice(0).map((manager) => manager.shutdownAll()));
  for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("workspace-symbol process-crash demand", () => {
  it("retries a failed initial startup during an explicit refresh", async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-startup-retry-"));
    tempRoots.push(workspace);
    const file = path.join(workspace, "source.test");
    fs.writeFileSync(file, "source\n");
    const manager = new LspManager(config, workspace);
    managers.push(manager);
    mocks.startBehaviors.push(async () => {
      throw new Error("initial startup failed");
    });

    await expect(manager.startServerForRoot("test", workspace)).resolves.toBeNull();
    mocks.startBehaviors.push(() => {
      (mocks.clients.at(-1) as InstanceType<typeof mocks.FakeClient> | undefined)?.becomeReady();
    });

    const result = await manager.recoverWorkspaceDiagnostics({
      restartIfStillStale: false,
      processCrashDemand: { explicit: true, scopes: [file] },
    });

    expect(result.startupRetry).toEqual({
      recoveredRoutes: 1,
      failedRoutes: 0,
      entries: [{ name: "test", root: ".", outcome: "recovered" }],
      omittedEntries: 0,
    });
    expect(manager.getProjectServerInfo("test", workspace, ["test"])).toMatchObject({
      status: "running",
      ready: true,
    });
  });

  it("retries a failed initial startup through exact-file readiness", async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-file-startup-retry-"));
    tempRoots.push(workspace);
    const file = path.join(workspace, "source.test");
    fs.writeFileSync(file, "source\n");
    const manager = new LspManager(config, workspace);
    managers.push(manager);
    mocks.startBehaviors.push(async () => {
      throw new Error("initial startup failed");
    });

    await expect(manager.startServerForRoot("test", workspace)).resolves.toBeNull();
    mocks.startBehaviors.push(() => {
      (mocks.clients.at(-1) as InstanceType<typeof mocks.FakeClient> | undefined)?.becomeReady();
    });

    const result = await manager.waitUntilFileReady(file, undefined, {
      retryFailedRoute: true,
    });

    expect(result.startupRetry).toEqual({
      recoveredRoutes: 1,
      failedRoutes: 0,
      entries: [{ name: "test", root: ".", outcome: "recovered" }],
      omittedEntries: 0,
    });
    expect(result.client?.ready).toBe(true);
  });

  it("retries an exhausted crash route through exact-file readiness", async () => {
    const fixture = await createTwoCrashedRoutes({ crashA: false });
    mocks.startBehaviors.push(async () => {
      throw new Error("automatic replacement failed");
    });
    await expect(
      fixture.manager.getClientForFile(fixture.fileB, { recoverProcessCrash: true }),
    ).resolves.toBeNull();

    mocks.startBehaviors.push(() => {
      (mocks.clients.at(-1) as InstanceType<typeof mocks.FakeClient> | undefined)?.becomeReady();
    });

    const result = await fixture.manager.waitUntilFileReady(fixture.fileB, undefined, {
      retryFailedRoute: true,
    });

    expect(result.processCrashRecovery).toEqual({
      recoveredRoutes: 1,
      skippedRoutes: 0,
      failedRoutes: 0,
      exhaustedRoutes: 0,
      entries: [{ name: "test", root: "b", outcome: "recovered" }],
      omittedEntries: 0,
    });
    expect(result.startupRetry.entries).toHaveLength(0);
    expect(result.client?.ready).toBe(true);
  });

  it("reports a readiness failure after an explicit crash retry", async () => {
    const fixture = await createTwoCrashedRoutes({ crashA: false });
    mocks.startBehaviors.push(async () => {
      throw new Error("automatic replacement failed");
    });
    await expect(
      fixture.manager.getClientForFile(fixture.fileB, { recoverProcessCrash: true }),
    ).resolves.toBeNull();

    mocks.startBehaviors.push(() => {
      (mocks.clients.at(-1) as InstanceType<typeof mocks.FakeClient> | undefined)?.becomeReady();
    });
    mocks.readinessBehaviors.push(async () => {
      throw new Error("readiness failed");
    });

    const result = await fixture.manager.waitUntilFileReady(fixture.fileB, undefined, {
      retryFailedRoute: true,
    });

    expect(result.processCrashRecovery).toMatchObject({
      recoveredRoutes: 0,
      failedRoutes: 1,
      entries: [
        {
          name: "test",
          root: "b",
          outcome: "recovery-failed",
          failureMessage: "readiness failed",
        },
      ],
    });
    expect(result.startupRetry.entries).toHaveLength(0);
  });

  it("discovers and starts a configured route that is now available", async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-discovery-retry-"));
    tempRoots.push(workspace);
    fs.writeFileSync(path.join(workspace, "route.marker"), "");
    fs.writeFileSync(path.join(workspace, "source.test"), "source\n");
    const manager = new LspManager(
      {
        servers: {
          test: { ...config.servers.test, rootMarkers: ["route.marker"] },
        },
      },
      workspace,
    );
    managers.push(manager);

    const result = await manager.recoverWorkspaceDiagnostics({
      restartIfStillStale: false,
      processCrashDemand: { explicit: true, scopes: [workspace] },
    });

    expect(result.startupRetry).toEqual({
      recoveredRoutes: 0,
      failedRoutes: 0,
      entries: [],
      omittedEntries: 0,
    });
    expect(manager.getProjectServerInfo("test", workspace, ["test"])).toMatchObject({
      status: "running",
    });
    expect(mocks.clients).toHaveLength(1);
  });

  it("reports a failed first start discovered during an explicit refresh", async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-discovery-failure-"));
    tempRoots.push(workspace);
    fs.writeFileSync(path.join(workspace, "route.marker"), "");
    fs.writeFileSync(path.join(workspace, "source.test"), "source\n");
    const manager = new LspManager(
      {
        servers: {
          test: { ...config.servers.test, rootMarkers: ["route.marker"] },
        },
      },
      workspace,
    );
    managers.push(manager);
    mocks.startBehaviors.push(async () => {
      throw new Error("discovered startup failed");
    });

    const result = await manager.recoverWorkspaceDiagnostics({
      restartIfStillStale: false,
      processCrashDemand: { explicit: true, scopes: [workspace] },
    });

    expect(result.startupRetry).toMatchObject({
      recoveredRoutes: 0,
      failedRoutes: 1,
      entries: [
        {
          name: "test",
          root: ".",
          outcome: "retry-failed",
          nextAction: "refresh",
          failureMessage: "discovered startup failed",
        },
      ],
    });
    expect(result.refreshFailureReason).toContain("startup retry failed");
  });

  it("retries an exhausted route on later explicit refreshes and restores its budget", async () => {
    const fixture = await createTwoCrashedRoutes({
      crashA: false,
      rootMarkers: ["route.marker"],
    });
    mocks.startBehaviors.push(async () => {
      throw new Error("automatic replacement failed");
    });
    await fixture.manager.getClientForFile(fixture.fileB, { recoverProcessCrash: true });

    mocks.startBehaviors.push(async () => {
      throw new Error("explicit replacement failed");
    });
    const failed = await fixture.manager.recoverWorkspaceDiagnostics({
      restartIfStillStale: false,
      processCrashDemand: { explicit: true, scopes: [fixture.fileB] },
    });
    expect(failed.processCrashRecovery).toMatchObject({
      failedRoutes: 1,
      entries: [
        {
          name: "test",
          root: "b",
          outcome: "recovery-failed",
          nextAction: "refresh",
        },
      ],
    });

    mocks.startBehaviors.push(() => {
      (mocks.clients.at(-1) as InstanceType<typeof mocks.FakeClient> | undefined)?.becomeReady();
    });
    const recovered = await fixture.manager.recoverWorkspaceDiagnostics({
      restartIfStillStale: false,
      processCrashDemand: { explicit: true, scopes: [fixture.fileB] },
    });
    expect(recovered.processCrashRecovery).toMatchObject({
      recoveredRoutes: 1,
      entries: [{ name: "test", root: "b", outcome: "recovered" }],
    });

    const replacement = mocks.clients.at(-1) as InstanceType<typeof mocks.FakeClient> | undefined;
    if (!replacement) throw new Error("Expected the explicit replacement.");
    replacement.crash();
    mocks.startBehaviors.push(() => undefined);
    await expect(
      fixture.manager.getClientForFile(fixture.fileB, { recoverProcessCrash: true }),
    ).resolves.toBeTruthy();
    expect(mocks.clients).toHaveLength(6);
  });

  it("shares an explicit retry after the first caller is cancelled", async () => {
    const fixture = await createTwoCrashedRoutes({
      crashA: false,
      rootMarkers: ["route.marker"],
    });
    const start = deferred<void>();
    mocks.startBehaviors.push(() => start.promise);
    const controller = new AbortController();
    const cancelled = fixture.manager.recoverWorkspaceDiagnostics({
      restartIfStillStale: false,
      processCrashDemand: { explicit: true, scopes: [fixture.rootB] },
      control: { signal: controller.signal },
    });
    await vi.waitFor(() => expect(mocks.clients).toHaveLength(3));

    controller.abort(new Error("refresh cancelled"));
    await expect(cancelled).rejects.toThrow("refresh cancelled");

    const later = fixture.manager.recoverWorkspaceDiagnostics({
      restartIfStillStale: false,
      processCrashDemand: { explicit: true, scopes: [fixture.rootB] },
    });
    start.resolve();
    await expect(later).resolves.toMatchObject({
      processCrashRecovery: { recoveredRoutes: 1 },
    });
    expect(mocks.clients).toHaveLength(3);
  });

  it("reports a scope-specific unavailable reason when no route intersects", async () => {
    const fixture = await createTwoCrashedRoutes({ crashA: false });
    const unrelatedScope = path.join(fixture.manager.getCwd(), "c");
    fs.mkdirSync(unrelatedScope);

    await expect(
      fixture.manager.workspaceSymbol("tracked", undefined, [unrelatedScope]),
    ).resolves.toEqual({
      kind: "unavailable",
      reason: "No known LSP route intersects the requested workspace-symbol scope.",
    });
    expect(mocks.clients).toHaveLength(2);
  });

  it("recovers only the crashed route for an exact file scope", async () => {
    const fixture = await createTwoCrashedRoutes();
    const start = deferred<void>();
    mocks.startBehaviors.push(() => start.promise);

    const symbols = fixture.manager.workspaceSymbol("tracked", undefined, [fixture.fileA]);
    await vi.waitFor(() => expect(mocks.clients).toHaveLength(3));
    expect(fixture.manager.getProjectServerInfo("test", fixture.rootA, ["test"])).toMatchObject({
      statusReason: "process-crash-recovery-pending",
    });
    expect(fixture.manager.getProjectServerInfo("test", fixture.rootB, ["test"])).toMatchObject({
      statusReason: "process-crashed",
    });

    start.resolve();
    await expect(symbols).resolves.toMatchObject({ kind: "completed" });
    expect(mocks.clients).toHaveLength(3);
  });

  it("starts all required unscoped replacements in parallel", async () => {
    const fixture = await createTwoCrashedRoutes();
    const startA = deferred<void>();
    const startB = deferred<void>();
    mocks.startBehaviors.push(
      () => startA.promise,
      () => startB.promise,
    );

    const symbols = fixture.manager.workspaceSymbol("tracked");
    await vi.waitFor(() => expect(mocks.clients).toHaveLength(4));

    startA.resolve();
    startB.resolve();
    await expect(symbols).resolves.toMatchObject({
      kind: "completed",
      data: expect.arrayContaining([expect.objectContaining({ name: "tracked" })]),
    });
    const outcomes = mocks.recordDebugEvent.mock.calls.map(([event]) => event.data?.outcome);
    expect(outcomes.filter((outcome) => outcome === "attempt")).toHaveLength(2);
    expect(outcomes.filter((outcome) => outcome === "success")).toHaveLength(2);
  });

  it("recovers a crashed route required by explicit diagnostic demand", async () => {
    const fixture = await createTwoCrashedRoutes({ crashA: false });

    const result = await fixture.manager.recoverWorkspaceDiagnostics({
      restartIfStillStale: false,
      processCrashDemand: { scopes: [fixture.rootB] },
    });

    expect(result.attemptedClients).toBe(2);
    expect(result.processCrashRecovery).toEqual({
      recoveredRoutes: 1,
      skippedRoutes: 0,
      failedRoutes: 0,
      exhaustedRoutes: 0,
      entries: [{ name: "test", root: "b", outcome: "recovered" }],
      omittedEntries: 0,
    });
    expect(mocks.clients).toHaveLength(3);
    expect(fixture.manager.getProjectServerInfo("test", fixture.rootB, ["test"])).toMatchObject({
      status: "running",
      ready: false,
    });
  });

  it("skips a crashed route without retained files without consuming its attempt", async () => {
    const fixture = await createTwoCrashedRoutes({ crashA: false, trackB: false });

    const skipped = await fixture.manager.recoverWorkspaceDiagnostics({
      restartIfStillStale: false,
      processCrashDemand: { scopes: [fixture.rootB] },
    });

    expect(skipped.processCrashRecovery).toEqual({
      recoveredRoutes: 0,
      skippedRoutes: 1,
      failedRoutes: 0,
      exhaustedRoutes: 0,
      entries: [
        {
          name: "test",
          root: "b",
          outcome: "skipped-no-retained-file",
          nextAction: "use-exact-file",
        },
      ],
      omittedEntries: 0,
    });
    expect(mocks.clients).toHaveLength(2);
    expect(fixture.manager.getProjectServerInfo("test", fixture.rootB, ["test"])).toMatchObject({
      statusReason: "process-crashed",
    });
  });

  it("does not consume a route attempt when retained files are outside the scope", async () => {
    const fixture = await createTwoCrashedRoutes({ crashA: false });
    const nestedScope = path.join(fixture.rootB, "nested");
    fs.mkdirSync(nestedScope);

    const skipped = await fixture.manager.recoverWorkspaceDiagnostics({
      restartIfStillStale: false,
      processCrashDemand: { scopes: [nestedScope] },
    });
    expect(skipped.processCrashRecovery.skippedRoutes).toBe(1);
    expect(mocks.clients).toHaveLength(2);

    const recovered = await fixture.manager.recoverWorkspaceDiagnostics({
      restartIfStillStale: false,
      processCrashDemand: { scopes: [fixture.fileB] },
    });
    expect(recovered.processCrashRecovery.recoveredRoutes).toBe(1);
    expect(mocks.clients).toHaveLength(3);
  });

  it("selects an overlapping route before applying retained-file scope", async () => {
    const fixture = await createTwoCrashedRoutes();
    const nestedScope = path.join(fixture.rootA, "nested");
    fs.mkdirSync(nestedScope);

    const result = await fixture.manager.recoverWorkspaceDiagnostics({
      restartIfStillStale: false,
      processCrashDemand: { scopes: [nestedScope] },
    });

    expect(result.processCrashRecovery).toEqual({
      recoveredRoutes: 0,
      skippedRoutes: 1,
      failedRoutes: 0,
      exhaustedRoutes: 0,
      entries: [
        {
          name: "test",
          root: "a",
          outcome: "skipped-no-retained-file",
          nextAction: "use-exact-file",
        },
      ],
      omittedEntries: 0,
    });
    expect(mocks.clients).toHaveLength(2);
  });

  it("reports an exhausted route without attempting it again", async () => {
    const fixture = await createTwoCrashedRoutes({ crashA: false });
    mocks.startBehaviors.push(async () => {
      throw new Error("replacement failed");
    });

    await fixture.manager.recoverWorkspaceDiagnostics({
      restartIfStillStale: false,
      processCrashDemand: { scopes: [fixture.fileB] },
    });
    const exhausted = await fixture.manager.recoverWorkspaceDiagnostics({
      restartIfStillStale: false,
      processCrashDemand: { scopes: [fixture.fileB] },
    });

    expect(exhausted.processCrashRecovery).toEqual({
      recoveredRoutes: 0,
      skippedRoutes: 0,
      failedRoutes: 0,
      exhaustedRoutes: 1,
      entries: [
        {
          name: "test",
          root: "b",
          outcome: "recovery-exhausted",
          nextAction: "refresh",
        },
      ],
      omittedEntries: 0,
    });
    expect(mocks.clients).toHaveLength(3);
  });

  it("keeps failed diagnostic evidence when a required route cannot recover", async () => {
    const fixture = await createTwoCrashedRoutes({ crashA: false });
    mocks.startBehaviors.push(async () => {
      throw new Error("replacement failed");
    });

    const result = await fixture.manager.recoverWorkspaceDiagnostics({
      restartIfStillStale: false,
      processCrashDemand: { scopes: [fixture.fileB] },
    });

    expect(result.refreshFailureReason).toContain("test @ b is unavailable");
    expect(result.refreshFailureReason).toContain("process recovery failed");
    expect(result.processCrashRecovery).toEqual({
      recoveredRoutes: 0,
      skippedRoutes: 0,
      failedRoutes: 1,
      exhaustedRoutes: 0,
      entries: [
        {
          name: "test",
          root: "b",
          outcome: "recovery-failed",
          nextAction: "refresh",
          failureMessage: "replacement failed",
        },
      ],
      omittedEntries: 0,
    });
    expect(result.diagnosticEvidence).toMatchObject({
      failed: 1,
      documents: expect.arrayContaining([
        {
          file: path.relative(fixture.manager.getCwd(), fixture.fileB),
          status: "failed",
        },
      ]),
    });
    expect(result.diagnosticEvidence.documents).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: path.relative(fixture.manager.getCwd(), fixture.fileBOutside),
        }),
      ]),
    );
  });

  it("returns healthy symbols as partial when one required route cannot recover", async () => {
    const fixture = await createTwoCrashedRoutes({ crashA: false });
    mocks.startBehaviors.push(async () => {
      throw new Error("replacement failed");
    });

    const result = await fixture.manager.workspaceSymbol("tracked");

    expect(result).toMatchObject({
      kind: "partial",
      data: [expect.objectContaining({ name: "tracked" })],
      reason: expect.stringContaining("process recovery failed"),
    });
  });
});

async function createTwoCrashedRoutes(
  options: { crashA?: boolean; trackB?: boolean; rootMarkers?: string[] } = {},
): Promise<{
  manager: LspManager;
  rootA: string;
  rootB: string;
  fileA: string;
  fileB: string;
  fileBOutside: string;
}> {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-workspace-demand-"));
  tempRoots.push(workspace);
  const rootA = path.join(workspace, "a");
  const rootB = path.join(workspace, "b");
  fs.mkdirSync(rootA);
  fs.mkdirSync(rootB);
  for (const marker of options.rootMarkers ?? []) {
    fs.writeFileSync(path.join(rootA, marker), "");
    fs.writeFileSync(path.join(rootB, marker), "");
  }
  const fileA = path.join(rootA, "tracked.test");
  const fileB = path.join(rootB, "tracked.test");
  const fileBOutside = path.join(rootB, "outside.test");
  fs.writeFileSync(fileA, "a\n");
  fs.writeFileSync(fileB, "b\n");
  fs.writeFileSync(fileBOutside, "outside\n");

  const managerConfig = options.rootMarkers
    ? {
        ...config,
        servers: {
          test: { ...config.servers.test, rootMarkers: options.rootMarkers },
        },
      }
    : config;
  const manager = new LspManager(managerConfig, workspace);
  managers.push(manager);
  const clientA = await manager.startServerForRoot("test", rootA);
  const clientB = await manager.startServerForRoot("test", rootB);
  if (!clientA || !clientB) throw new Error("Expected both clients.");
  const fakeA = clientA as unknown as InstanceType<typeof mocks.FakeClient>;
  const fakeB = clientB as unknown as InstanceType<typeof mocks.FakeClient>;
  fakeA.becomeReady();
  fakeB.becomeReady();
  fakeA.didOpen(fileA);
  if (options.trackB !== false) {
    fakeB.didOpen(fileB);
    fakeB.didOpen(fileBOutside);
  }
  if (options.crashA !== false) fakeA.crash();
  fakeB.crash();
  return { manager, rootA, rootB, fileA, fileB, fileBOutside };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
