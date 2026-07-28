import { completedCodeQuery } from "@mrclrchtr/supi-code-runtime/api";
import { describe, expect, it } from "vitest";
import type { LspClient } from "../../src/client/client.ts";
import type {
  Diagnostic,
  FileChangeType,
  FileEvent,
  Hover,
  Position,
  SymbolInformation,
} from "../../src/config/types.ts";
import type { LspManager as Manager } from "../../src/manager/manager.ts";
import { createWorkspaceLspRuntimeOwner } from "../../src/session/runtime-registry.ts";

function makeManager(overrides: Record<string, unknown>): Manager {
  return {
    getCwd: () => "/project",
    ...overrides,
  } as unknown as Manager;
}

function createRuntime(manager: Manager) {
  return createWorkspaceLspRuntimeOwner(manager).runtime;
}

const diagnostic = {
  message: "Type error",
  range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
  severity: 1,
} as Diagnostic;

const symbol: SymbolInformation = {
  name: "greet",
  kind: 12,
  location: {
    uri: "file:///project/src/index.ts",
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
  },
};

describe("workspace runtime behavior", () => {
  it("returns semantic facts with normalized paths and raw LSP positions", async () => {
    const openedPaths: string[] = [];
    let receivedPosition: Position | undefined;
    const hover: Hover = { contents: "function greet" };
    const client = {
      hover: async (filePath: string, position: Position) => {
        openedPaths.push(filePath);
        receivedPosition = position;
        return completedCodeQuery(hover);
      },
    } as unknown as LspClient;
    const runtime = createRuntime(
      makeManager({ ensureFileOpen: async (_filePath: string) => client }),
    );

    const result = await runtime.hover("@src/index.ts", { line: 4, character: 7 });

    expect(result).toEqual({ kind: "completed", data: hover });
    expect(openedPaths).toEqual(["/project/src/index.ts"]);
    expect(receivedPosition).toEqual({ line: 4, character: 7 });
  });

  it("returns facts for each per-file semantic operation", async () => {
    const facts = {
      definition: { uri: "file:///project/src/definition.ts" },
      references: [{ uri: "file:///project/src/reference.ts" }],
      implementation: { uri: "file:///project/src/implementation.ts" },
      documentSymbols: [{ name: "greet" }],
      rename: { changes: {} },
      codeActions: [{ title: "Fix it" }],
    };
    const client = {
      definition: async () => completedCodeQuery(facts.definition),
      references: async () => completedCodeQuery(facts.references),
      implementation: async () => completedCodeQuery(facts.implementation),
      documentSymbols: async () => completedCodeQuery(facts.documentSymbols),
      rename: async () => facts.rename,
      getDiagnostics: () => [],
      codeActions: async () => facts.codeActions,
    } as unknown as LspClient;
    const runtime = createRuntime(makeManager({ ensureFileOpen: async () => client }));

    await expect(
      Promise.all([
        runtime.definition("src/index.ts", { line: 0, character: 0 }),
        runtime.references("src/index.ts", { line: 0, character: 0 }),
        runtime.implementation("src/index.ts", { line: 0, character: 0 }),
        runtime.documentSymbols("src/index.ts"),
        runtime.rename("src/index.ts", { line: 0, character: 0 }, "hello"),
        runtime.codeActions("src/index.ts", { line: 0, character: 0 }),
      ]),
    ).resolves.toEqual([
      completedCodeQuery(facts.definition),
      completedCodeQuery(facts.references),
      completedCodeQuery(facts.implementation),
      completedCodeQuery(facts.documentSymbols),
      facts.rename,
      facts.codeActions,
    ]);
  });

  it("returns workspace symbols and routing facts from the runtime", async () => {
    const projectServers = [
      {
        name: "typescript",
        root: "/project",
        fileTypes: ["ts"],
        status: "running" as const,
        openFiles: [],
      },
    ];
    const supportedPaths: string[] = [];
    const runtime = createRuntime(
      makeManager({
        workspaceSymbol: async () => completedCodeQuery([symbol]),
        getKnownProjectServers: () => projectServers,
        canServeFile: (filePath: string) => {
          supportedPaths.push(filePath);
          return true;
        },
      }),
    );

    await expect(runtime.workspaceSymbol("greet")).resolves.toEqual(completedCodeQuery([symbol]));
    expect(runtime.getProjectServers()).toEqual(projectServers);
    expect(runtime.isSupportedSourceFile("@src/index.ts")).toBe(true);
    expect(supportedPaths).toEqual(["/project/src/index.ts"]);
  });

  it("reports file readiness only when routing establishes a concrete client", async () => {
    const readyPaths: string[] = [];
    const client = {} as LspClient;
    const readyRuntime = createRuntime(
      makeManager({
        canServeFile: (filePath: string) => filePath === "/project/src/index.ts",
        waitUntilFileReady: async (filePath: string) => {
          readyPaths.push(filePath);
          return client;
        },
      }),
    );

    await expect(
      readyRuntime.waitUntilReadyForFile("@src/index.ts", { timeoutMs: 100 }),
    ).resolves.toEqual({ kind: "ready" });
    expect(readyPaths).toEqual(["/project/src/index.ts"]);

    const failedRouteRuntime = createRuntime(
      makeManager({
        canServeFile: () => true,
        waitUntilFileReady: async () => null,
      }),
    );
    await expect(
      failedRouteRuntime.waitUntilReadyForFile("src/index.ts", { timeoutMs: 100 }),
    ).resolves.toMatchObject({ kind: "unavailable" });

    const timeoutRuntime = createRuntime(
      makeManager({
        canServeFile: () => true,
        waitUntilFileReady: () => new Promise<never>(() => {}),
      }),
    );
    await expect(
      timeoutRuntime.waitUntilReadyForFile("src/index.ts", { timeoutMs: 1 }),
    ).resolves.toEqual({ kind: "timeout" });
  });

  it("reports workspace readiness only when at least one live client is ready", async () => {
    const emptyRuntime = createRuntime(makeManager({ waitUntilWorkspaceReady: async () => 0 }));
    await expect(
      emptyRuntime.waitUntilReadyForWorkspace({ timeoutMs: 100 }),
    ).resolves.toMatchObject({ kind: "unavailable" });

    const readyRuntime = createRuntime(makeManager({ waitUntilWorkspaceReady: async () => 1 }));
    await expect(readyRuntime.waitUntilReadyForWorkspace({ timeoutMs: 100 })).resolves.toEqual({
      kind: "ready",
    });
  });

  it("returns diagnostics and cascades for normalized files", async () => {
    const syncPaths: Array<{ filePath: string; maxSeverity: number }> = [];
    const cascadePaths: Array<{ filePath: string; maxSeverity: number }> = [];
    const cascade = [{ file: "src/consumer.ts", diagnostics: [diagnostic] }];
    const runtime = createRuntime(
      makeManager({
        canServeFile: () => true,
        syncFileAndGetDiagnostics: async (filePath: string, maxSeverity: number) => {
          syncPaths.push({ filePath, maxSeverity });
          return completedCodeQuery([diagnostic]);
        },
        syncFileAndGetCascadingDiagnostics: async (filePath: string, maxSeverity: number) => {
          cascadePaths.push({ filePath, maxSeverity });
          return completedCodeQuery(cascade);
        },
      }),
    );

    await expect(runtime.fileDiagnostics("@src/index.ts", 2)).resolves.toEqual(
      completedCodeQuery([diagnostic]),
    );
    await expect(runtime.fileDiagnosticsWithCascade("@src/index.ts", 4)).resolves.toEqual(
      completedCodeQuery(cascade),
    );
    expect(syncPaths).toEqual([{ filePath: "/project/src/index.ts", maxSeverity: 2 }]);
    expect(cascadePaths).toEqual([{ filePath: "/project/src/index.ts", maxSeverity: 4 }]);
  });

  it("publishes diagnostic summaries and recovery facts", async () => {
    const summary = [{ file: "src/index.ts", errors: 1, warnings: 0 }];
    const outstanding = [{ file: "src/index.ts", diagnostics: [diagnostic] }];
    const outstandingSummary = [
      { file: "src/index.ts", total: 1, errors: 1, warnings: 0, information: 0, hints: 0 },
    ];
    const recovery = {
      refreshedClients: 1,
      restartedClients: 1,
      staleAssessment: {
        suspected: false,
        matchedFiles: [],
        warning: null,
      },
    };
    let recoveryOptions: unknown;
    const runtime = createRuntime(
      makeManager({
        getDiagnosticSummary: () => summary,
        getOutstandingDiagnostics: () => outstanding,
        getOutstandingDiagnosticSummary: () => outstandingSummary,
        recoverWorkspaceDiagnostics: async (options: unknown) => {
          recoveryOptions = options;
          return recovery;
        },
      }),
    );

    expect(runtime.getWorkspaceDiagnosticSummary()).toEqual(summary);
    expect(runtime.getOutstandingDiagnostics(1)).toEqual(outstanding);
    expect(runtime.getOutstandingDiagnosticSummary(1)).toEqual(outstandingSummary);
    await expect(runtime.recoverDiagnostics({ restartIfStillStale: true })).resolves.toEqual(
      recovery,
    );
    expect(recoveryOptions).toEqual({ restartIfStillStale: true });
  });

  it("coordinates tracking, refresh, and workspace-change invalidation", async () => {
    const events: string[] = [];
    const trackedPaths: string[] = [];
    const closedPaths: string[] = [];
    let refreshOptions: unknown;
    let receivedChanges: FileEvent[] | undefined;
    const changes = [{ uri: "file:///project/src/index.ts", type: 2 as FileChangeType }];
    const runtime = createRuntime(
      makeManager({
        ensureFileOpen: async (filePath: string) => {
          trackedPaths.push(filePath);
          return {};
        },
        closeFile: (filePath: string) => closedPaths.push(filePath),
        pruneMissingFiles: () => ["src/missing.ts"],
        refreshOpenDiagnostics: async (options: unknown) => {
          refreshOptions = options;
        },
        clearAllPullResultIds: () => events.push("invalidate-pull-results"),
        notifyWorkspaceFileChanges: (nextChanges: FileEvent[]) => {
          events.push("notify-workspace-changes");
          receivedChanges = nextChanges;
        },
      }),
    );

    await expect(runtime.trackFile("@src/index.ts")).resolves.toBe(true);
    runtime.closeFile("@src/index.ts");
    expect(runtime.pruneMissingFiles()).toEqual(["src/missing.ts"]);
    await runtime.refreshOpenDiagnostics({ maxWaitMs: 10, quietMs: 2 });
    runtime.noteWorkspaceChanges(changes);

    expect(trackedPaths).toEqual(["/project/src/index.ts"]);
    expect(closedPaths).toEqual(["/project/src/index.ts"]);
    expect(refreshOptions).toEqual({ maxWaitMs: 10, quietMs: 2 });
    expect(events).toEqual(["invalidate-pull-results", "notify-workspace-changes"]);
    expect(receivedChanges).toEqual(changes);
  });

  it("keeps shutdown under the owner instead of the public runtime", async () => {
    let shutDown = false;
    const owner = createWorkspaceLspRuntimeOwner(
      makeManager({
        shutdownAll: async () => {
          shutDown = true;
        },
      }),
    );

    expect(owner.runtime).not.toHaveProperty("shutdown");
    await owner.shutdown();
    expect(shutDown).toBe(true);
  });
});
