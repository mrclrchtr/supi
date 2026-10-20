import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const clients: FakeClient[] = [];
  const rootStatFailures = new Map<string, string>();
  const shutdownBehaviors: Array<() => void | Promise<void>> = [];
  const startBehaviors: Array<() => void | Promise<void>> = [];

  class FakeClient {
    readonly serverCapabilities = { workspaceSymbolProvider: true };
    readonly openFiles: string[] = [];
    status: "initializing" | "running" | "error" | "shutdown" = "initializing";
    ready = false;

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
      if (behavior) await behavior();
      if (this.status === "shutdown") throw new Error("client shut down during start");
      this.status = "running";
      this.listener?.("startup");
    }

    async shutdown(): Promise<void> {
      const behavior = shutdownBehaviors.shift();
      if (behavior) await behavior();
      this.status = "shutdown";
      this.ready = false;
      this.listener?.("shutdown");
    }

    async forceKill(): Promise<void> {
      this.status = "shutdown";
    }

    dispose(): void {
      this.ready = false;
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

    pruneMissingFiles(): string[] {
      return [];
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

    clearPullResultIds(): void {}

    notifyWorkspaceFileChanges(): void {}

    refreshOpenDiagnostics() {
      return Promise.resolve({
        requested: this.openFiles.length,
        confirmed: 0,
        unconfirmed: 0,
        failed: this.openFiles.length,
        removed: 0,
        documents: this.openFiles.map((file) => ({ file, status: "failed" as const })),
      });
    }

    getRecoveryStallSignal(): null {
      return null;
    }

    markFailedFile(): void {}
  }

  return { clients, FakeClient, rootStatFailures, shutdownBehaviors, startBehaviors };
});

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    statSync: ((filePath: fs.PathLike, ...args: unknown[]) => {
      const code = mocks.rootStatFailures.get(filePath.toString());
      if (code) throw Object.assign(new Error("root inspection failed"), { code });
      return (actual.statSync as (...values: unknown[]) => unknown)(filePath, ...args);
    }) as typeof actual.statSync,
  };
});

vi.mock("../../src/client/client.ts", () => ({
  withTimeout: async <T>(operation: Promise<T>) => operation,
  RECOVERY_CLIENT_STARTUP_BOUND_MS: 5_000,
  LspClient: mocks.FakeClient,
}));

import type { LspConfig } from "../../src/config/types.ts";
import { LspManager, type ManagerLifecycleTransition } from "../../src/manager/manager.ts";

type FakeClient = InstanceType<typeof mocks.FakeClient>;

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

function activeExplicitRetryCallers(manager: LspManager, key: string): number | undefined {
  const leases = (
    manager as unknown as {
      explicitRouteAttempts: Map<string, { users: number }>;
    }
  ).explicitRouteAttempts;
  return leases.get(key)?.users;
}

function createWorkspace(): string {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-root-retirement-"));
  tempRoots.push(workspace);
  return workspace;
}

afterEach(async () => {
  await Promise.all(managers.splice(0).map((manager) => manager.shutdownAll()));
  for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  mocks.clients.length = 0;
  mocks.rootStatFailures.clear();
  mocks.shutdownBehaviors.length = 0;
  mocks.startBehaviors.length = 0;
});

describe("LSP route root retirement", () => {
  it("removes a deleted ready route and keeps a surviving route ready", async () => {
    const workspace = createWorkspace();
    const removedRoot = path.join(workspace, "removed");
    const survivingRoot = path.join(workspace, "surviving");
    fs.mkdirSync(removedRoot);
    fs.mkdirSync(survivingRoot);
    const transitions: ManagerLifecycleTransition[] = [];
    const manager = new LspManager(config, workspace, (event) => transitions.push(event));
    managers.push(manager);
    const removedClient = await manager.startServerForRoot("test", removedRoot);
    const survivingClient = await manager.startServerForRoot("test", survivingRoot);
    if (!removedClient || !survivingClient) throw new Error("Expected both routes to start.");
    (removedClient as unknown as FakeClient).becomeReady();
    (survivingClient as unknown as FakeClient).becomeReady();

    fs.rmSync(removedRoot, { recursive: true });
    manager.pruneMissingFiles();

    await vi.waitFor(() => expect(removedClient.status).toBe("shutdown"));
    expect(manager.getKnownProjectServers([]).map((server) => server.root)).toEqual([
      survivingRoot,
    ]);
    expect(transitions.at(-1)).toMatchObject({
      kind: "retirement",
      semanticReady: true,
      projectServers: [expect.objectContaining({ root: survivingRoot, ready: true })],
    });
  });

  it("does not let a pending startup publish a route retired during startup", async () => {
    const workspace = createWorkspace();
    const root = path.join(workspace, "project");
    fs.mkdirSync(root);
    const manager = new LspManager(config, workspace);
    managers.push(manager);
    const start = deferred<void>();
    mocks.startBehaviors.push(() => start.promise);

    const pending = manager.startServerForRoot("test", root);
    await vi.waitFor(() => expect(mocks.clients).toHaveLength(1));
    fs.rmSync(root, { recursive: true });
    manager.pruneMissingFiles();
    start.resolve(undefined);

    await expect(pending).resolves.toBeNull();
    expect(manager.getKnownProjectServers([])).toEqual([]);
    expect(manager.getProjectServerInfo("test", root, ["test"]).status).toBe("unavailable");
  });

  it("starts a recreated root without joining its retired pending startup", async () => {
    const workspace = createWorkspace();
    const root = path.join(workspace, "project");
    fs.mkdirSync(root);
    const manager = new LspManager(config, workspace);
    managers.push(manager);
    const start = deferred<void>();
    mocks.startBehaviors.push(() => start.promise);
    const oldStart = manager.startServerForRoot("test", root);
    await vi.waitFor(() => expect(mocks.clients).toHaveLength(1));
    fs.rmSync(root, { recursive: true });
    manager.pruneMissingFiles();
    fs.mkdirSync(root);

    try {
      const recreated = manager.startServerForRoot("test", root);
      expect(mocks.clients).toHaveLength(2);
      await expect(recreated).resolves.toMatchObject({ root, status: "running" });
    } finally {
      start.resolve(undefined);
      await expect(oldStart).resolves.toBeNull();
    }
    expect(manager.getKnownProjectServers([])).toMatchObject([{ root, status: "running" }]);
    expect(mocks.clients[0].status).toBe("shutdown");
  });

  it("starts a new explicit retry after a route root is recreated", async () => {
    const root = createWorkspace();
    const file = path.join(root, "source.test");
    fs.writeFileSync(file, "source\n");
    const manager = new LspManager(config, root);
    managers.push(manager);
    mocks.startBehaviors.push(async () => {
      throw new Error("initial startup failed");
    });
    await expect(manager.startServerForRoot("test", root)).resolves.toBeNull();

    const oldStart = deferred<void>();
    mocks.startBehaviors.push(() => oldStart.promise);
    const oldRefresh = manager.recoverWorkspaceDiagnostics({
      restartIfStillStale: false,
      processCrashDemand: { explicit: true, scopes: [file] },
    });
    await vi.waitFor(() => expect(mocks.clients).toHaveLength(2));

    fs.rmSync(root, { recursive: true });
    manager.pruneMissingFiles();
    fs.mkdirSync(root);
    fs.writeFileSync(file, "source\n");

    const replacementStart = deferred<void>();
    mocks.startBehaviors.push(() => replacementStart.promise);
    const replacementRefresh = manager.recoverWorkspaceDiagnostics({
      restartIfStillStale: false,
      processCrashDemand: { explicit: true, scopes: [file] },
    });

    try {
      await vi.waitFor(() => expect(mocks.clients).toHaveLength(3), { timeout: 1_000 });
      replacementStart.resolve(undefined);
      await replacementRefresh;
      expect(manager.getProjectServerInfo("test", root, ["test"]).status).toBe("running");
    } finally {
      oldStart.resolve(undefined);
      replacementStart.resolve(undefined);
      await Promise.allSettled([oldRefresh, replacementRefresh]);
    }

    await expect(oldRefresh).resolves.toMatchObject({
      startupRetry: { recoveredRoutes: 0, failedRoutes: 0 },
    });
  });

  it("releases only the old caller's explicit retry lease after recreation", async () => {
    const root = createWorkspace();
    const file = path.join(root, "source.test");
    fs.writeFileSync(file, "source\n");
    const manager = new LspManager(config, root);
    managers.push(manager);
    mocks.startBehaviors.push(async () => {
      throw new Error("initial startup failed");
    });
    await expect(manager.startServerForRoot("test", root)).resolves.toBeNull();

    const oldStart = deferred<void>();
    mocks.startBehaviors.push(() => oldStart.promise);
    const oldRefresh = manager.recoverWorkspaceDiagnostics({
      restartIfStillStale: false,
      processCrashDemand: { explicit: true, scopes: [file] },
    });
    await vi.waitFor(() => expect(mocks.clients).toHaveLength(2));

    fs.rmSync(root, { recursive: true });
    manager.pruneMissingFiles();
    fs.mkdirSync(root);
    fs.writeFileSync(file, "source\n");

    const replacementStart = deferred<void>();
    mocks.startBehaviors.push(() => replacementStart.promise);
    const replacementRefresh = manager.recoverWorkspaceDiagnostics({
      restartIfStillStale: false,
      processCrashDemand: { explicit: true, scopes: [file] },
    });
    const key = `test:${root}`;

    try {
      await vi.waitFor(() => expect(mocks.clients).toHaveLength(3));
      oldStart.resolve(undefined);
      await oldRefresh;
      expect(activeExplicitRetryCallers(manager, key)).toBe(1);
      replacementStart.resolve(undefined);
      await replacementRefresh;
    } finally {
      oldStart.resolve(undefined);
      replacementStart.resolve(undefined);
      await Promise.allSettled([oldRefresh, replacementRefresh]);
    }
  });

  it("retires a route when root inspection reports ENOTDIR", async () => {
    const workspace = createWorkspace();
    const root = path.join(workspace, "project");
    fs.mkdirSync(root);
    const manager = new LspManager(config, workspace);
    managers.push(manager);
    const client = await manager.startServerForRoot("test", root);
    if (!client) throw new Error("Expected the route to start.");
    mocks.rootStatFailures.set(root, "ENOTDIR");

    manager.pruneMissingFiles();

    await vi.waitFor(() => expect(client.status).toBe("shutdown"));
    expect(manager.getKnownProjectServers([])).toEqual([]);
  });

  it("retires a route when its root path is a non-directory", async () => {
    const workspace = createWorkspace();
    const root = path.join(workspace, "not-a-directory");
    fs.writeFileSync(root, "file\n");
    const manager = new LspManager(config, workspace);
    managers.push(manager);
    const client = await manager.startServerForRoot("test", root);
    if (!client) throw new Error("Expected the route to start.");

    manager.pruneMissingFiles();

    await vi.waitFor(() => expect(client.status).toBe("shutdown"));
    expect(manager.getKnownProjectServers([])).toEqual([]);
  });

  it("does not retry a crashed route after its root is deleted", async () => {
    const workspace = createWorkspace();
    const root = path.join(workspace, "project");
    fs.mkdirSync(root);
    const file = path.join(root, "source.test");
    fs.writeFileSync(file, "source\n");
    const manager = new LspManager(config, workspace);
    managers.push(manager);
    const client = await manager.startServerForRoot("test", root);
    if (!client) throw new Error("Expected the route to start.");
    const fakeClient = client as unknown as FakeClient;
    fakeClient.becomeReady();
    fakeClient.didOpen(file);
    fakeClient.crash();

    const startCount = mocks.clients.length;
    fs.rmSync(root, { recursive: true });
    const result = await manager.recoverWorkspaceDiagnostics({
      restartIfStillStale: false,
      processCrashDemand: { scopes: [root] },
    });

    expect(mocks.clients).toHaveLength(startCount);
    expect(result.processCrashRecovery).toMatchObject({
      recoveredRoutes: 0,
      failedRoutes: 0,
      exhaustedRoutes: 0,
    });
    expect(manager.getKnownProjectServers([])).toEqual([]);
  });

  it("does not let a pending shared crash replacement restore a retired route", async () => {
    const workspace = createWorkspace();
    const root = path.join(workspace, "project");
    fs.mkdirSync(root);
    const file = path.join(root, "source.test");
    fs.writeFileSync(file, "source\n");
    const manager = new LspManager(config, workspace);
    managers.push(manager);
    const original = await manager.startServerForRoot("test", root);
    if (!original) throw new Error("Expected the route to start.");
    const originalFake = original as unknown as FakeClient;
    originalFake.becomeReady();
    originalFake.didOpen(file);
    originalFake.crash();
    const start = deferred<void>();
    mocks.startBehaviors.push(() => start.promise);

    const pending = manager.getClientForFile(file, { recoverProcessCrash: true });
    await vi.waitFor(() => expect(mocks.clients).toHaveLength(2));
    fs.rmSync(root, { recursive: true });
    manager.pruneMissingFiles();
    start.resolve(undefined);

    await expect(pending).resolves.toBeNull();
    expect(manager.getKnownProjectServers([])).toEqual([]);
    expect(mocks.clients).toHaveLength(2);
  });

  it("does not let a pending diagnostic restart restore a retired route", async () => {
    const workspace = createWorkspace();
    const root = path.join(workspace, "project");
    fs.mkdirSync(root);
    const file = path.join(root, "source.test");
    fs.writeFileSync(file, "source\n");
    const manager = new LspManager(config, workspace);
    managers.push(manager);
    const original = await manager.startServerForRoot("test", root);
    if (!original) throw new Error("Expected the route to start.");
    const originalFake = original as unknown as FakeClient;
    originalFake.becomeReady();
    originalFake.didOpen(file);
    const shutdown = deferred<void>();
    mocks.shutdownBehaviors.push(() => shutdown.promise);

    const pending = manager.restartClientsForFiles([file]);
    await vi.waitFor(() => expect(mocks.shutdownBehaviors).toHaveLength(0));
    fs.rmSync(root, { recursive: true });
    manager.pruneMissingFiles();
    shutdown.resolve(undefined);

    await expect(pending).resolves.toMatchObject([{ restarted: false }]);
    expect(manager.getKnownProjectServers([])).toEqual([]);
    expect(mocks.clients).toHaveLength(1);
  });

  it("restarts a recreated route with its new client while the old restart waits", async () => {
    const root = createWorkspace();
    const file = path.join(root, "source.test");
    fs.writeFileSync(file, "source\n");
    const manager = new LspManager(config, root);
    managers.push(manager);
    const original = await manager.startServerForRoot("test", root);
    if (!original) throw new Error("Expected the route to start.");
    (original as unknown as FakeClient).becomeReady();
    (original as unknown as FakeClient).didOpen(file);

    const oldShutdown = deferred<void>();
    mocks.shutdownBehaviors.push(() => oldShutdown.promise);
    const oldRestart = manager.restartClientsForFiles([file]);
    await vi.waitFor(() => expect(mocks.shutdownBehaviors).toHaveLength(0));

    fs.rmSync(root, { recursive: true });
    manager.pruneMissingFiles();
    fs.mkdirSync(root);
    fs.writeFileSync(file, "source\n");
    const recreated = await manager.startServerForRoot("test", root);
    if (!recreated) throw new Error("Expected the recreated route to start.");

    const replacementRestart = manager.restartClientsForFiles([file]);
    try {
      await vi.waitFor(() => expect(mocks.clients).toHaveLength(3), { timeout: 1_000 });
      await expect(replacementRestart).resolves.toMatchObject([{ restarted: true }]);
    } finally {
      oldShutdown.resolve(undefined);
      await Promise.allSettled([oldRestart, replacementRestart]);
    }

    await expect(oldRestart).resolves.toMatchObject([{ restarted: false }]);
  });

  it.each(["EACCES", "EPERM", "EIO"])(
    "keeps a route when root inspection fails with %s",
    async (code) => {
      const workspace = createWorkspace();
      const root = path.join(workspace, "project");
      fs.mkdirSync(root);
      const manager = new LspManager(config, workspace);
      managers.push(manager);
      const client = await manager.startServerForRoot("test", root);
      if (!client) throw new Error("Expected the route to start.");
      (client as unknown as FakeClient).becomeReady();
      mocks.rootStatFailures.set(root, code);

      manager.pruneMissingFiles();
      expect(client.status).toBe("running");
      expect(manager.getKnownProjectServers([])).toMatchObject([
        { root, status: "running", ready: true },
      ]);
    },
  );
});

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve: (value) => resolve(value) };
}
