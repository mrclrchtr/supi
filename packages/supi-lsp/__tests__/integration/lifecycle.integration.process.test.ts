import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { FileChangeType, type FileEvent, type LspConfig } from "../../src/config/types.ts";
import { LspManager, type ManagerLifecycleTransition } from "../../src/manager/manager.ts";
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

/** Push-only fixture: the first process publishes slowly, replacements publish quickly. */
function pushConfig(longDelayMs: number, marker: string, shortDelayMs: number): LspConfig {
  return {
    servers: {
      test: {
        command: process.execPath,
        args: [server, "push", String(longDelayMs), marker, String(shortDelayMs)],
        fileTypes: ["test"],
        rootMarkers: ["package.json"],
      },
    },
  };
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
      { key: `test:${root}`, files: [sourceFile], restarted: true },
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

  it("confirms fresh diagnostics only through the replacement process", async () => {
    const root = createProject();
    const sourceFile = path.join(root, "fresh.test");
    const marker = path.join(root, ".pushed-once");
    fs.writeFileSync(sourceFile, "fixture content\n");
    const manager = new LspManager(pushConfig(1_000, marker, 50), root);
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
});
