import { completedCodeQuery } from "@mrclrchtr/supi-code-runtime/api";
import { describe, expect, it, vi } from "vitest";

const debugMocks = vi.hoisted(() => ({ recordDebugEvent: vi.fn() }));

vi.mock("@mrclrchtr/supi-core/debug", () => ({
  recordDebugEvent: debugMocks.recordDebugEvent,
}));

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
    getScopeDecisionSummary: () => ({
      caseSensitiveFileNames: true,
      counts: { included: 0, excluded: 0, noConfig: 0, outOfTree: 0 },
      basisCounts: {},
      entries: [],
      totalFiles: 0,
    }),
    getProcessCrashRecoverySummaryForFile: () => null,
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

function emptyEvidence() {
  return {
    requested: 0,
    confirmed: 0,
    unconfirmed: 0,
    failed: 0,
    removed: 0,
    documents: [],
  } as const;
}

function fileReadiness(
  client: LspClient | null,
  processCrashRecovery = {
    attemptedRoutes: 0,
    recoveredRoutes: 0,
    failedRoutes: 0,
  },
) {
  return { client, processCrashRecovery };
}

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
      root: "/routed/project",
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
      {
        value: facts.rename,
        authorizedMutationRoots: ["/routed/project"],
      },
      {
        value: facts.codeActions,
        authorizedMutationRoots: ["/routed/project"],
      },
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
    const workspaceSymbol = vi.fn(async () => completedCodeQuery([symbol]));
    const runtime = createRuntime(
      makeManager({
        workspaceSymbol,
        getKnownProjectServers: () => projectServers,
        canServeFile: (filePath: string) => {
          supportedPaths.push(filePath);
          return true;
        },
      }),
    );

    await expect(runtime.workspaceSymbol("greet", undefined, ["/project/src"])).resolves.toEqual(
      completedCodeQuery([symbol]),
    );
    expect(workspaceSymbol).toHaveBeenCalledWith("greet", undefined, ["/project/src"]);
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
          return fileReadiness(client);
        },
      }),
    );

    await expect(
      readyRuntime.waitUntilReadyForFile("@src/index.ts", { timeoutMs: 100 }),
    ).resolves.toEqual({ kind: "ready" });
    expect(readyPaths).toEqual(["/project/src/index.ts"]);

    const recoveredRuntime = createRuntime(
      makeManager({
        canServeFile: () => true,
        waitUntilFileReady: async () =>
          fileReadiness(client, { attemptedRoutes: 1, recoveredRoutes: 1, failedRoutes: 0 }),
      }),
    );
    await expect(recoveredRuntime.waitUntilReadyForFile("src/index.ts")).resolves.toEqual({
      kind: "ready",
      processCrashRecovery: { attemptedRoutes: 1, recoveredRoutes: 1, failedRoutes: 0 },
    });

    const failedRouteRuntime = createRuntime(
      makeManager({
        canServeFile: () => true,
        waitUntilFileReady: async () => fileReadiness(null),
      }),
    );
    await expect(
      failedRouteRuntime.waitUntilReadyForFile("src/index.ts", { timeoutMs: 100 }),
    ).resolves.toMatchObject({ kind: "unavailable" });

    const failedUnavailableRouteRuntime = createRuntime(
      makeManager({
        canServeFile: () => false,
        getProcessCrashRecoverySummaryForFile: () => ({
          attemptedRoutes: 1,
          recoveredRoutes: 0,
          failedRoutes: 1,
        }),
      }),
    );
    await expect(
      failedUnavailableRouteRuntime.waitUntilReadyForFile("src/index.ts", { timeoutMs: 100 }),
    ).resolves.toEqual({
      kind: "unavailable",
      reason: "No LSP client can serve this file",
      processCrashRecovery: {
        attemptedRoutes: 1,
        recoveredRoutes: 0,
        failedRoutes: 1,
      },
    });

    const timeoutRuntime = createRuntime(
      makeManager({
        canServeFile: () => true,
        waitUntilFileReady: () => new Promise<never>(() => {}),
      }),
    );
    await expect(
      timeoutRuntime.waitUntilReadyForFile("src/index.ts", { timeoutMs: 1 }),
    ).resolves.toEqual({ kind: "timeout" });

    const recoveryTimeoutRuntime = createRuntime(
      makeManager({
        canServeFile: () => true,
        waitUntilFileReady: (
          _filePath: string,
          _control: unknown,
          reportRecovery?: (summary: {
            attemptedRoutes: number;
            recoveredRoutes: number;
            failedRoutes: number;
          }) => void,
        ) => {
          reportRecovery?.({ attemptedRoutes: 1, recoveredRoutes: 0, failedRoutes: 0 });
          return new Promise<never>(() => {});
        },
      }),
    );
    await expect(
      recoveryTimeoutRuntime.waitUntilReadyForFile("src/index.ts", { timeoutMs: 1 }),
    ).resolves.toEqual({
      kind: "timeout",
      processCrashRecovery: { attemptedRoutes: 1, recoveredRoutes: 0, failedRoutes: 0 },
    });
  });

  it("reports a failed recovery when the shared replacement fails after the eager attempt", async () => {
    const runtime = createRuntime(
      makeManager({
        canServeFile: () => true,
        getProcessCrashRecoverySummaryForFile: () => ({
          attemptedRoutes: 1,
          recoveredRoutes: 0,
          failedRoutes: 1,
        }),
        waitUntilFileReady: (
          _filePath: string,
          _control: unknown,
          reportRecovery?: (summary: {
            attemptedRoutes: number;
            recoveredRoutes: number;
            failedRoutes: number;
          }) => void,
        ) => {
          reportRecovery?.({ attemptedRoutes: 1, recoveredRoutes: 0, failedRoutes: 0 });
          return new Promise<never>(() => {});
        },
      }),
    );

    await expect(runtime.waitUntilReadyForFile("src/index.ts", { timeoutMs: 1 })).resolves.toEqual({
      kind: "timeout",
      processCrashRecovery: { attemptedRoutes: 1, recoveredRoutes: 0, failedRoutes: 1 },
    });
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

  it("returns diagnostics for normalized files", async () => {
    const syncPaths: Array<{ filePath: string; maxSeverity: number }> = [];
    const runtime = createRuntime(
      makeManager({
        canServeFile: () => true,
        syncFileAndGetDiagnostics: async (filePath: string, maxSeverity: number) => {
          syncPaths.push({ filePath, maxSeverity });
          return completedCodeQuery([diagnostic]);
        },
      }),
    );

    await expect(runtime.fileDiagnostics("@src/index.ts", 2)).resolves.toEqual(
      completedCodeQuery([diagnostic]),
    );
    expect(syncPaths).toEqual([{ filePath: "/project/src/index.ts", maxSeverity: 2 }]);
  });

  it("publishes diagnostic summaries and recovery facts", async () => {
    const summary = [{ file: "src/index.ts", errors: 1, warnings: 0 }];
    const outstanding = [{ file: "src/index.ts", diagnostics: [diagnostic] }];
    const outstandingSummary = [
      { file: "src/index.ts", total: 1, errors: 1, warnings: 0, information: 0, hints: 0 },
    ];
    const evidence = {
      requested: 1,
      confirmed: 1,
      unconfirmed: 0,
      failed: 0,
      removed: 0,
      documents: [{ file: "src/index.ts", status: "confirmed" as const }],
    };
    const recovery = {
      attemptedClients: 1,
      restartedClients: 1,
      attemptedServers: ["typescript"],
      restartedServers: ["typescript"],
      diagnosticEvidence: evidence,
      staleAssessment: {
        suspected: false,
        matchedFiles: [],
        warning: null,
      },
    };
    let recoveryOptions: unknown;
    const runtime = createRuntime(
      makeManager({
        getDiagnosticSnapshot: () => ({ entries: summary, current: true, evidence }),
        getOutstandingDiagnosticsSnapshot: () => ({
          entries: outstanding,
          current: true,
          evidence,
        }),
        getOutstandingDiagnosticSummarySnapshot: () => ({
          entries: outstandingSummary,
          current: true,
          evidence,
        }),
        recoverWorkspaceDiagnostics: async (options: unknown) => {
          recoveryOptions = options;
          return recovery;
        },
      }),
    );

    expect(runtime.getWorkspaceDiagnosticSummary()).toEqual({
      entries: summary,
      current: true,
      evidence,
    });
    expect(runtime.getOutstandingDiagnostics(1)).toEqual({
      entries: outstanding,
      current: true,
      evidence,
    });
    expect(runtime.getOutstandingDiagnosticSummary(1)).toEqual({
      entries: outstandingSummary,
      current: true,
      evidence,
    });
    await expect(runtime.recoverDiagnostics({ restartIfStillStale: true })).resolves.toEqual(
      recovery,
    );
    expect(recoveryOptions).toEqual({ restartIfStillStale: true });
  });

  it("forwards caller-supplied initial evidence into the recovery pass", async () => {
    const evidence = {
      requested: 1,
      confirmed: 1,
      unconfirmed: 0,
      failed: 0,
      removed: 0,
      documents: [{ file: "src/index.ts", status: "confirmed" as const }],
    };
    const recovery = {
      attemptedClients: 1,
      restartedClients: 0,
      diagnosticEvidence: evidence,
      staleAssessment: { suspected: false, matchedFiles: [], warning: null },
    };
    let recoveryOptions: unknown;
    const runtime = createRuntime(
      makeManager({
        recoverWorkspaceDiagnostics: async (options: unknown) => {
          recoveryOptions = options;
          return recovery;
        },
      }),
    );

    await expect(
      runtime.recoverDiagnostics({ restartIfStillStale: true, initialEvidence: evidence }),
    ).resolves.toEqual(recovery);
    expect(recoveryOptions).toEqual({ restartIfStillStale: true, initialEvidence: evidence });
  });

  it("records bounded recovery telemetry with identity, elapsed time, and restart count", async () => {
    const recovery = {
      attemptedClients: 2,
      restartedClients: 1,
      attemptedServers: ["typescript", "bash"],
      restartedServers: ["bash"],
      diagnosticEvidence: emptyEvidence(),
      staleAssessment: { suspected: false, matchedFiles: [], warning: null },
      elapsedMs: 12,
    };
    const runtime = createRuntime(
      makeManager({
        recoverWorkspaceDiagnostics: async () => recovery,
      }),
    );

    await runtime.recoverDiagnostics({ restartIfStillStale: true });

    expect(debugMocks.recordDebugEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "lsp",
        category: "runtime.recovery",
        cwd: "/project",
        data: expect.objectContaining({
          outcome: "completed",
          elapsedMs: 12,
          attemptedClients: 2,
          restartedClients: 1,
          attemptedServers: ["typescript", "bash"],
          restartedServers: ["bash"],
        }),
      }),
    );
    debugMocks.recordDebugEvent.mockClear();
  });

  it("records a failed recovery outcome in telemetry", async () => {
    const recovery = {
      attemptedClients: 1,
      restartedClients: 0,
      attemptedServers: ["typescript"],
      restartedServers: [],
      diagnosticEvidence: emptyEvidence(),
      refreshFailureReason: "refresh failed",
      staleAssessment: { suspected: false, matchedFiles: [], warning: null },
      elapsedMs: 4,
    };
    const runtime = createRuntime(
      makeManager({
        recoverWorkspaceDiagnostics: async () => recovery,
      }),
    );

    await runtime.recoverDiagnostics({ restartIfStillStale: true });

    expect(debugMocks.recordDebugEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: "/project",
        data: expect.objectContaining({
          outcome: "failed",
          elapsedMs: 4,
          restartedClients: 0,
          attemptedServers: ["typescript"],
          restartedServers: [],
        }),
      }),
    );
    debugMocks.recordDebugEvent.mockClear();
  });

  it("records the stall signal that triggered a restart in telemetry", async () => {
    const recovery = {
      attemptedClients: 1,
      restartedClients: 1,
      attemptedServers: ["typescript"],
      restartedServers: ["typescript"],
      restartReason: "readiness-stall" as const,
      diagnosticEvidence: emptyEvidence(),
      staleAssessment: { suspected: false, matchedFiles: [], warning: null },
      elapsedMs: 6,
    };
    const runtime = createRuntime(
      makeManager({
        recoverWorkspaceDiagnostics: async () => recovery,
      }),
    );

    await runtime.recoverDiagnostics({ restartIfStillStale: true });

    expect(debugMocks.recordDebugEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: "/project",
        data: expect.objectContaining({
          outcome: "completed",
          restartedClients: 1,
          restartedServers: ["typescript"],
          reason: "readiness-stall",
        }),
      }),
    );
    debugMocks.recordDebugEvent.mockClear();
  });

  it("records a cancelled recovery outcome in telemetry", async () => {
    const controller = new AbortController();
    const abortReason = new Error("cancelled mid-pass");
    controller.abort(abortReason);
    const runtime = createRuntime(
      makeManager({
        recoverWorkspaceDiagnostics: async () => {
          throw abortReason;
        },
        getRunningClientNames: () => ["typescript", "bash"],
      }),
    );

    await expect(
      runtime.recoverDiagnostics({
        restartIfStillStale: true,
        control: { signal: controller.signal },
      }),
    ).rejects.toThrow("cancelled mid-pass");

    expect(debugMocks.recordDebugEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "lsp",
        category: "runtime.recovery",
        cwd: "/project",
        message: "LSP diagnostic recovery cancelled",
        data: expect.objectContaining({
          outcome: "cancelled",
          elapsedMs: expect.any(Number),
          // Running server names stay available at cancellation; restart
          // identity is unavailable because the pass produced no result.
          attemptedServers: ["typescript", "bash"],
        }),
      }),
    );
    debugMocks.recordDebugEvent.mockClear();
  });

  it("coordinates tracking, refresh, and workspace-change invalidation", async () => {
    const events: string[] = [];
    const trackedPaths: string[] = [];
    const closedPaths: string[] = [];
    let refreshOptions: unknown;
    let receivedChanges: FileEvent[] | undefined;
    const changes = [{ uri: "file:///project/src/index.ts", type: 2 as FileChangeType }];
    const controller = new AbortController();
    const control = {
      signal: controller.signal,
      deadline: 987_654,
      operationId: "op-AAAAAAAAAAAAAAAAAAAAAA",
    };
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
          return emptyEvidence();
        },
        clearAllPullResultIds: () => events.push("invalidate-pull-results"),
        noteWorkspaceChanges: (nextChanges: FileEvent[]) => {
          events.push("notify-workspace-changes");
          receivedChanges = nextChanges;
        },
      }),
    );

    await expect(runtime.trackFile("@src/index.ts")).resolves.toBe(true);
    runtime.closeFile("@src/index.ts");
    expect(runtime.pruneMissingFiles()).toEqual(["src/missing.ts"]);
    await runtime.refreshOpenDiagnostics({ maxWaitMs: 10, quietMs: 2 }, control);
    runtime.noteWorkspaceChanges(changes);

    expect(trackedPaths).toEqual(["/project/src/index.ts"]);
    expect(closedPaths).toEqual(["/project/src/index.ts"]);
    expect(refreshOptions).toEqual({
      maxWaitMs: 10,
      quietMs: 2,
      signal: controller.signal,
      deadline: 987_654,
      operationId: "op-AAAAAAAAAAAAAAAAAAAAAA",
    });
    expect(events).toEqual(["invalidate-pull-results", "notify-workspace-changes"]);
    expect(receivedChanges).toEqual(changes);
  });

  it("rejects immediately when the caller is already aborted before readiness", async () => {
    const controller = new AbortController();
    controller.abort(new Error("cancelled before readiness"));
    const runtime = createRuntime(
      makeManager({
        canServeFile: () => true,
        waitUntilFileReady: vi.fn(async () => ({})),
      }),
    );

    await expect(
      runtime.waitUntilReadyForFile("/project/src/index.ts", {}, { signal: controller.signal }),
    ).rejects.toThrow("cancelled before readiness");
  });

  it("rejects with the abort reason when cancelled during a readiness wait", async () => {
    const controller = new AbortController();
    const runtime = createRuntime(
      makeManager({
        canServeFile: () => true,
        waitUntilFileReady: vi.fn(() => new Promise(() => {})),
      }),
    );

    const pending = runtime.waitUntilReadyForFile(
      "/project/src/index.ts",
      { timeoutMs: 60_000 },
      { signal: controller.signal },
    );
    controller.abort(new Error("cancelled during readiness"));

    await expect(pending).rejects.toThrow("cancelled during readiness");
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
