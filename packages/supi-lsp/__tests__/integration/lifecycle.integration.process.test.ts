import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { FileChangeType, type FileEvent, type LspConfig } from "../../src/config/types.ts";
import { LspManager, type ManagerLifecycleTransition } from "../../src/manager/manager.ts";
import { createWorkspaceLspRuntimeOwner } from "../../src/session/runtime-registry.ts";
import { fileToUri } from "../../src/utils.ts";
import { waitFor } from "../helpers/integration-utils.ts";

const server = fileURLToPath(new URL("../fixtures/lsp-lifecycle-server.mjs", import.meta.url));
const tempDirs: string[] = [];
const managers: LspManager[] = [];

function createProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-lifecycle-integration-"));
  tempDirs.push(root);
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "lifecycle-test" }));
  return root;
}

function config(mode: "stable" | "crash" | "crash-once", crashMarker?: string): LspConfig {
  return {
    servers: {
      test: {
        command: process.execPath,
        args: [server, mode, "50", ...(crashMarker ? [crashMarker] : [])],
        fileTypes: ["test"],
        rootMarkers: ["package.json"],
      },
    },
  };
}

/**
 * Push-only fixture with a readiness-stall signal: the first process
 * publishes slowly, publishes quickly after a marker, and creates a
 * work-done-progress token that never begins on every process.
 */
function stallPushConfig(longDelayMs: number, marker: string, shortDelayMs: number): LspConfig {
  return {
    servers: {
      test: {
        command: process.execPath,
        args: [server, "stall-push", String(longDelayMs), marker, String(shortDelayMs)],
        fileTypes: ["test"],
        rootMarkers: ["package.json"],
        readinessTimeoutMs: 200,
      },
    },
  };
}

/** Progress fixture: the server emits a configurable work-done-progress sequence. */
function progressConfig(
  sequence: "normal" | "create-only" | "begin-only" | "end-only" | "duplicate-create",
  stepMs = 40,
  readinessTimeoutMs = 200,
): LspConfig {
  return {
    servers: {
      test: {
        command: process.execPath,
        args: [server, "progress", sequence, String(stepMs)],
        fileTypes: ["test"],
        rootMarkers: ["package.json"],
        readinessTimeoutMs,
      },
    },
  };
}

/** Count readiness-loss transitions (semantic readiness dropped to false). */
function readinessLosses(transitions: ManagerLifecycleTransition[]): number {
  return transitions.filter(
    (transition) => transition.kind === "readiness" && !transition.semanticReady,
  ).length;
}

afterEach(async () => {
  await Promise.all(managers.splice(0).map((manager) => manager.shutdownAll()));
  for (const directory of tempDirs.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("LSP manager lifecycle integration", () => {
  it("publishes a real process crash without restoring semantic readiness", async () => {
    const root = createProject();
    const transitions: ManagerLifecycleTransition[] = [];
    const manager = new LspManager(config("crash"), root, (transition) => {
      transitions.push(transition);
    });
    managers.push(manager);

    const original = await manager.startServerForRoot("test", root);
    expect(original).not.toBeNull();
    await waitFor(
      async () => transitions,
      (events) => events.some((event) => event.kind === "crash"),
      { timeoutMs: 2_000, retryDelayMs: 20, label: "real LSP process crash" },
    );
    expect(manager.getProjectServerInfo("test", root, ["test"]).status).toBe("error");

    const eventCount = transitions.length;
    const lateClient = original as unknown as { publishLifecycle(kind: "readiness"): void };
    lateClient.publishLifecycle("readiness");
    expect(transitions).toHaveLength(eventCount + 1);
    expect(transitions.at(-1)).toMatchObject({ kind: "readiness", semanticReady: false });
  });

  it("publishes recovery when a crashed process is replaced through file recovery", async () => {
    const root = createProject();
    const sourceFile = path.join(root, "recovery.test");
    const crashMarker = path.join(root, ".crashed-once");
    fs.writeFileSync(sourceFile, "recovery fixture\n");
    const transitions: ManagerLifecycleTransition[] = [];
    const manager = new LspManager(config("crash-once", crashMarker), root, (transition) => {
      transitions.push(transition);
    });
    managers.push(manager);
    const original = await manager.startServerForRoot("test", root);
    if (!original) throw new Error("Expected the original client to start.");
    original.didOpen(sourceFile, fs.readFileSync(sourceFile, "utf8"));
    await waitFor(
      async () => transitions,
      (events) => events.some((event) => event.kind === "crash"),
      { timeoutMs: 2_000, retryDelayMs: 20, label: "initial LSP process crash" },
    );

    await expect(manager.restartClientsForFiles([sourceFile])).resolves.toEqual([
      { key: `test:${root}`, serverName: "test", files: [sourceFile], restarted: true },
    ]);
    const replacement = await manager.startServerForRoot("test", root);
    if (!replacement) throw new Error("Expected the replacement client to start.");
    expect(replacement).not.toBe(original);
    await replacement.getReady();

    await waitFor(
      async () => transitions,
      (events) => events.some((event) => event.kind === "recovery" && event.semanticReady),
      { timeoutMs: 3_000, retryDelayMs: 20, label: "replacement LSP process recovery" },
    );

    expect(transitions.at(-1)).toMatchObject({ kind: "recovery", semanticReady: true });
  }, 10_000);

  it("recovers the same file-routed semantic operation after a process crash", async () => {
    const root = createProject();
    const sourceFile = path.join(root, "recovery.test");
    const crashMarker = path.join(root, ".crashed-once");
    fs.writeFileSync(sourceFile, "recovery fixture\n");
    const transitions: ManagerLifecycleTransition[] = [];
    const manager = new LspManager(config("crash-once", crashMarker), root, (transition) => {
      transitions.push(transition);
    });
    managers.push(manager);

    const original = await manager.startServerForRoot("test", root);
    if (!original) throw new Error("Expected the original client to start.");
    original.didOpen(sourceFile, fs.readFileSync(sourceFile, "utf8"));
    await waitFor(
      async () => transitions,
      (events) => events.some((event) => event.kind === "crash"),
      { timeoutMs: 2_000, retryDelayMs: 20, label: "initial LSP process crash" },
    );
    expect(transitions.filter((event) => event.kind === "startup")).toHaveLength(1);

    const runtime = createWorkspaceLspRuntimeOwner(manager);
    const result = await runtime.runtime.documentSymbols(sourceFile);

    expect(result.kind).toBe("completed");
    if (result.kind !== "completed") throw new Error("Expected recovered semantic evidence.");
    expect(result.data[0]?.name).toMatch(/^generation-\d+$/);
    expect(transitions.filter((event) => event.kind === "startup")).toHaveLength(2);
    expect(manager.getProjectServerInfo("test", root, ["test"])).toMatchObject({
      status: "running",
      ready: true,
    });
  }, 10_000);

  it("reports process-crash recovery separately during diagnostic refresh", async () => {
    const root = createProject();
    const sourceFile = path.join(root, "recovery.test");
    const crashMarker = path.join(root, ".crashed-once");
    fs.writeFileSync(sourceFile, "recovery fixture\n");
    const manager = new LspManager(config("crash-once", crashMarker), root);
    managers.push(manager);

    const original = await manager.startServerForRoot("test", root);
    if (!original) throw new Error("Expected the original client to start.");
    original.didOpen(sourceFile, fs.readFileSync(sourceFile, "utf8"));
    await waitFor(
      async () => manager.getProjectServerInfo("test", root, ["test"]),
      (info) => info.statusReason === "process-crashed",
      { timeoutMs: 2_000, retryDelayMs: 20, label: "diagnostic refresh process crash" },
    );

    const runtime = createWorkspaceLspRuntimeOwner(manager).runtime;
    const result = await runtime.recoverDiagnostics({
      restartIfStillStale: false,
      processCrashDemand: { scopes: [sourceFile] },
    });

    expect(result.processCrashRecovery).toEqual({
      attemptedRoutes: 1,
      recoveredRoutes: 1,
      failedRoutes: 0,
    });
    expect(result.restartedClients).toBe(0);
    expect(manager.getProjectServerInfo("test", root, ["test"])).toMatchObject({
      status: "running",
    });
  }, 10_000);

  it("reports failed process-crash recovery during file readiness", async () => {
    const root = createProject();
    const sourceFile = path.join(root, "recovery.test");
    fs.writeFileSync(sourceFile, "recovery fixture\n");
    const transitions: ManagerLifecycleTransition[] = [];
    const manager = new LspManager(config("crash"), root, (transition) => {
      transitions.push(transition);
    });
    managers.push(manager);

    const original = await manager.startServerForRoot("test", root);
    if (!original) throw new Error("Expected the original client to start.");
    original.didOpen(sourceFile, fs.readFileSync(sourceFile, "utf8"));
    await waitFor(
      async () => transitions,
      (events) => events.some((event) => event.kind === "crash"),
      { timeoutMs: 2_000, retryDelayMs: 20, label: "initial LSP process crash" },
    );

    const runtime = createWorkspaceLspRuntimeOwner(manager).runtime;
    await expect(runtime.waitUntilReadyForFile(sourceFile)).resolves.toMatchObject({
      kind: "unavailable",
      processCrashRecovery: {
        attemptedRoutes: 1,
        recoveredRoutes: 0,
        failedRoutes: 1,
      },
    });
    expect(manager.getProjectServerInfo("test", root, ["test"])).toMatchObject({
      status: "error",
      statusReason: "process-crash-recovery-exhausted",
    });
  }, 10_000);

  it("does not report old crash recovery after an unrelated restart failure", async () => {
    const root = createProject();
    const sourceFile = path.join(root, "recovery.test");
    const crashMarker = path.join(root, ".crashed-once");
    fs.writeFileSync(sourceFile, "recovery fixture\n");
    const lspConfig = config("crash-once", crashMarker);
    const manager = new LspManager(lspConfig, root);
    managers.push(manager);

    const original = await manager.startServerForRoot("test", root);
    if (!original) throw new Error("Expected the original client to start.");
    original.didOpen(sourceFile, fs.readFileSync(sourceFile, "utf8"));
    await waitFor(
      async () => manager.getProjectServerInfo("test", root, ["test"]),
      (info) => info.statusReason === "process-crashed",
      { timeoutMs: 2_000, retryDelayMs: 20, label: "initial LSP process crash" },
    );

    const runtime = createWorkspaceLspRuntimeOwner(manager).runtime;
    await expect(runtime.documentSymbols(sourceFile)).resolves.toMatchObject({
      kind: "completed",
    });

    lspConfig.servers.test.command = path.join(root, "missing-lsp-command");
    await expect(manager.restartClientsForFiles([sourceFile])).resolves.toMatchObject([
      { restarted: false },
    ]);

    await expect(runtime.waitUntilReadyForFile(sourceFile)).resolves.toEqual({
      kind: "unavailable",
      reason: "No LSP client can serve this file",
    });
  }, 10_000);

  it("shares one real replacement across concurrent workspace-symbol demand", async () => {
    const root = createProject();
    const sourceFile = path.join(root, "recovery.test");
    const crashMarker = path.join(root, ".crashed-once");
    fs.writeFileSync(sourceFile, "recovery fixture\n");
    const transitions: ManagerLifecycleTransition[] = [];
    const manager = new LspManager(config("crash-once", crashMarker), root, (transition) => {
      transitions.push(transition);
    });
    managers.push(manager);

    const original = await manager.startServerForRoot("test", root);
    if (!original) throw new Error("Expected the original client to start.");
    original.didOpen(sourceFile, fs.readFileSync(sourceFile, "utf8"));
    await waitFor(
      async () => transitions,
      (events) => events.some((event) => event.kind === "crash"),
      { timeoutMs: 2_000, retryDelayMs: 20, label: "workspace-symbol process crash" },
    );

    const runtime = createWorkspaceLspRuntimeOwner(manager).runtime;
    const [first, second] = await Promise.all([
      runtime.workspaceSymbol("generation", undefined, [sourceFile]),
      runtime.workspaceSymbol("generation", undefined, [sourceFile]),
    ]);

    expect(first).toMatchObject({ kind: "completed" });
    expect(second).toMatchObject({ kind: "completed" });
    if (first.kind !== "completed" || second.kind !== "completed") {
      throw new Error("Expected recovered workspace-symbol evidence.");
    }
    expect(first.data[0]?.name).toMatch(/^generation-\d+$/);
    expect(second.data[0]?.name).toBe(first.data[0]?.name);
    expect(transitions.filter((event) => event.kind === "startup")).toHaveLength(2);
  }, 10_000);

  it("restarts a stalled push-only client and confirms diagnostics through the replacement", async () => {
    const root = createProject();
    const sourceFile = path.join(root, "fresh.test");
    const marker = path.join(root, ".pushed-once");
    fs.writeFileSync(sourceFile, "fixture content\n");
    const manager = new LspManager(stallPushConfig(1_000, marker, 50), root);
    managers.push(manager);

    const original = await manager.startServerForRoot("test", root);
    if (!original) throw new Error("Expected the original client to start.");
    const originalPid = (original as unknown as { process: { pid?: number } }).process?.pid;
    original.didOpen(sourceFile, fs.readFileSync(sourceFile, "utf8"));
    const changes: FileEvent[] = [{ uri: fileToUri(sourceFile), type: FileChangeType.Changed }];

    const recovery = await manager.recoverWorkspaceDiagnostics({
      changes,
      restartIfStillStale: true,
      maxWaitMs: 200,
      quietMs: 20,
    });

    expect(recovery.restartedClients).toBe(1);
    expect(recovery.restartReason).toBe("readiness-stall");
    expect(recovery.elapsedMs).toBeTypeOf("number");
    expect(recovery.diagnosticEvidence).toMatchObject({
      confirmed: 1,
      unconfirmed: 0,
      failed: 0,
      removed: 0,
    });

    const relativeFile = path.relative(root, sourceFile);
    await waitFor(
      async () => manager.getOutstandingDiagnostics(1),
      (entries) => entries.some((entry) => entry.file === relativeFile),
      { timeoutMs: 2_000, retryDelayMs: 20, label: "replacement process diagnostics" },
    );
    const entry = manager
      .getOutstandingDiagnostics(1)
      .find((candidate) => candidate.file === relativeFile);
    const message = entry?.diagnostics[0]?.message ?? "";
    const text = typeof message === "string" ? message : message.value;
    expect(text).toMatch(/^fresh-\d+$/);
    const publisherPid = Number.parseInt(text.slice("fresh-".length), 10);
    expect(publisherPid).not.toBe(originalPid);
  }, 10_000);

  it("resolves readiness through a real create→begin→report→end sequence", async () => {
    const root = createProject();
    const transitions: ManagerLifecycleTransition[] = [];
    const manager = new LspManager(progressConfig("normal"), root, (transition) => {
      transitions.push(transition);
    });
    managers.push(manager);

    const client = await manager.startServerForRoot("test", root);
    if (!client) throw new Error("Expected the progress client to start.");
    const started = Date.now();
    await waitFor(
      async () => client.ready,
      (ready) => ready === true,
      { timeoutMs: 5_000, retryDelayMs: 20, label: "progress sequence readiness" },
    );

    // The begin→end cycle resolves well before the 2s grace window, which
    // proves the readiness path ran through the progress tokens.
    expect(Date.now() - started).toBeLessThan(1_500);
    expect(transitions.at(-1)).toMatchObject({ kind: "readiness", semanticReady: true });
  }, 10_000);

  it("does not lose readiness for a created token that never begins", async () => {
    const root = createProject();
    const transitions: ManagerLifecycleTransition[] = [];
    const manager = new LspManager(progressConfig("create-only", 40, 200), root, (transition) => {
      transitions.push(transition);
    });
    managers.push(manager);

    const client = await manager.startServerForRoot("test", root);
    if (!client) throw new Error("Expected the progress client to start.");
    await waitFor(
      async () => client.ready,
      (ready) => ready === true,
      { timeoutMs: 5_000, retryDelayMs: 20, label: "create-only readiness" },
    );

    // The unused token never produced a readiness loss; the grace window
    // resolved readiness without any per-token timeout transition.
    expect(readinessLosses(transitions)).toBe(0);
  }, 10_000);

  it("bounds readiness for a begin without a prior create", async () => {
    const root = createProject();
    const transitions: ManagerLifecycleTransition[] = [];
    const manager = new LspManager(progressConfig("begin-only", 40, 200), root, (transition) => {
      transitions.push(transition);
    });
    managers.push(manager);

    const client = await manager.startServerForRoot("test", root);
    if (!client) throw new Error("Expected the progress client to start.");
    const started = Date.now();
    await waitFor(
      async () => client.ready,
      (ready) => ready === true,
      { timeoutMs: 5_000, retryDelayMs: 20, label: "begin-only readiness" },
    );

    // begin blocks readiness and the bounded token timeout restores it well
    // before the 2s grace window would have resolved.
    expect(Date.now() - started).toBeLessThan(1_500);
    expect(transitions.at(-1)).toMatchObject({ kind: "readiness", semanticReady: true });
  }, 10_000);

  it("ignores an end for a token that was never created", async () => {
    const root = createProject();
    const transitions: ManagerLifecycleTransition[] = [];
    const manager = new LspManager(progressConfig("end-only", 40, 200), root, (transition) => {
      transitions.push(transition);
    });
    managers.push(manager);

    const client = await manager.startServerForRoot("test", root);
    if (!client) throw new Error("Expected the progress client to start.");
    await waitFor(
      async () => client.ready,
      (ready) => ready === true,
      { timeoutMs: 5_000, retryDelayMs: 20, label: "end-only readiness" },
    );

    expect(readinessLosses(transitions)).toBe(0);
  }, 10_000);
});
