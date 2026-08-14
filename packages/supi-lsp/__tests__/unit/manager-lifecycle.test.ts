import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clients: [] as Array<{
    becomeReady(): void;
    crash(): void;
    didOpen(file: string): void;
    emit(kind: string): void;
    getReady(): Promise<void>;
    getDiagnosticSnapshot(): {
      entries: [];
      documents: [];
      current: boolean;
    };
    markFailedFile(file: string): void;
    loseReadiness(): void;
    name: string;
    openFiles: string[];
    ready: boolean;
    root: string;
    shutdown(): Promise<void>;
    start(): Promise<void>;
    status: "initializing" | "running" | "error" | "shutdown";
  }>,
}));

vi.mock("../../src/client/client.ts", () => ({
  withTimeout: async <T>(operation: Promise<T>) => operation,
  RECOVERY_CLIENT_STARTUP_BOUND_MS: 5_000,
  LspClient: class {
    readonly name: string;
    readonly root: string;
    readonly serverCapabilities = null;
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
      mocks.clients.push(this);
    }

    async start(): Promise<void> {
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

    becomeReady(): void {
      this.ready = true;
      this.listener?.("readiness");
    }

    loseReadiness(): void {
      this.ready = false;
      this.listener?.("readiness");
    }

    crash(): void {
      this.status = "error";
      this.ready = false;
      this.listener?.("crash");
    }

    emit(kind: string): void {
      this.listener?.(kind);
    }

    async getReady(): Promise<void> {
      if (!this.ready) throw new Error("Client is not ready.");
    }

    didOpen(file: string): void {
      if (!this.openFiles.includes(file)) this.openFiles.push(file);
      this.listener?.("tracked-files");
    }

    didClose(file: string): void {
      this.openFiles = this.openFiles.filter((entry) => entry !== file);
      this.listener?.("tracked-files");
    }

    pruneMissingFiles(): string[] {
      return [];
    }

    getOpenDocumentVersion(): null {
      return null;
    }

    getDiagnosticSnapshot(): { entries: []; documents: []; current: boolean } {
      return { entries: [], documents: [], current: true };
    }

    getRecoveryStallSignal(): null {
      return null;
    }

    forceKill(): Promise<void> {
      return Promise.resolve();
    }

    markFailedFile(_file: string): void {}
  },
}));

import type { ProjectServerInfo } from "../../src/config/types.ts";
import { LspManager, type ManagerLifecycleTransition } from "../../src/manager/manager.ts";

const config = {
  servers: {
    typescript: {
      command: "node",
      fileTypes: ["ts"],
      rootMarkers: ["package.json"],
    },
  },
};

function createManager(transitions: ManagerLifecycleTransition[]): LspManager {
  return new LspManager(config, "/project", (transition) => transitions.push(transition));
}

function expectServerReady(servers: readonly ProjectServerInfo[], ready: boolean): void {
  expect(servers).toHaveLength(1);
  expect(servers[0]?.ready).toBe(ready);
}

describe("LspManager lifecycle aggregation", () => {
  beforeEach(() => {
    mocks.clients.length = 0;
  });

  it("publishes startup and concrete readiness snapshots", async () => {
    const transitions: ManagerLifecycleTransition[] = [];
    const manager = createManager(transitions);

    await manager.startServerForRoot("typescript", "/project");
    mocks.clients[0]?.becomeReady();

    expect(transitions.map((transition) => transition.kind)).toEqual(["startup", "readiness"]);
    expect(transitions.map((transition) => transition.semanticReady)).toEqual([false, true]);
    expectServerReady(transitions[1]?.projectServers ?? [], true);
  });

  it("stays semantically ready until the final concrete client is lost", async () => {
    const transitions: ManagerLifecycleTransition[] = [];
    const manager = createManager(transitions);
    await manager.startServerForRoot("typescript", "/project/a");
    await manager.startServerForRoot("typescript", "/project/b");
    const [first, second] = mocks.clients;
    if (!first || !second) throw new Error("Expected two clients.");

    first.becomeReady();
    second.becomeReady();
    first.loseReadiness();
    second.crash();

    expect(transitions.map((transition) => transition.semanticReady)).toEqual([
      false,
      false,
      true,
      true,
      true,
      false,
    ]);
    expect(transitions.at(-1)?.kind).toBe("crash");
  });

  it("publishes tracked-file snapshots", async () => {
    const transitions: ManagerLifecycleTransition[] = [];
    const manager = createManager(transitions);
    await manager.startServerForRoot("typescript", "/project");
    const client = mocks.clients[0];
    if (!client) throw new Error("Expected a client.");

    client.didOpen("/project/src/a.ts");

    expect(transitions.at(-1)).toMatchObject({ kind: "tracked-files" });
    expect(transitions.at(-1)?.projectServers[0]?.openFiles).toEqual(["src/a.ts"]);
  });

  it("reports workspace readiness when one concrete client is ready", async () => {
    const transitions: ManagerLifecycleTransition[] = [];
    const manager = createManager(transitions);
    await manager.startServerForRoot("typescript", "/project/a");
    await manager.startServerForRoot("typescript", "/project/b");
    const first = mocks.clients[0];
    if (!first) throw new Error("Expected a ready client.");
    first.becomeReady();

    await expect(manager.waitUntilWorkspaceReady()).resolves.toBe(1);
  });

  it("ignores late facts from a replaced client generation", async () => {
    const transitions: ManagerLifecycleTransition[] = [];
    const manager = createManager(transitions);
    await manager.startServerForRoot("typescript", "/project");
    const original = mocks.clients[0];
    if (!original) throw new Error("Expected an original client.");
    original.becomeReady();

    await (
      manager as unknown as {
        restartClient(client: (typeof mocks.clients)[number]): Promise<boolean>;
      }
    ).restartClient(original);
    const replacement = mocks.clients[1];
    if (!replacement) throw new Error("Expected a replacement client.");
    const transitionCount = transitions.length;

    original.ready = true;
    original.emit("readiness");

    expect(transitions).toHaveLength(transitionCount);

    replacement.becomeReady();

    expect(transitions.at(-1)).toMatchObject({ kind: "recovery", semanticReady: true });
  });
});
