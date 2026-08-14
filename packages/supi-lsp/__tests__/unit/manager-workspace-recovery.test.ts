import { describe, expect, it, vi } from "vitest";
import { type Diagnostic, FileChangeType } from "../../src/config/types.ts";
import { recoverWorkspaceDiagnostics } from "../../src/manager/manager-workspace-recovery.ts";

function makeDiagnostic(message: string): Diagnostic {
  return {
    message,
    severity: 1,
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
  };
}

describe("recoverWorkspaceDiagnostics", () => {
  it("keeps final document evidence after a restart recovery", async () => {
    const firstEvidence = {
      requested: 1,
      confirmed: 0,
      unconfirmed: 1,
      failed: 0,
      removed: 0,
      documents: [{ file: "src/a.ts", status: "unconfirmed" as const }],
    };
    const finalEvidence = {
      requested: 1,
      confirmed: 1,
      unconfirmed: 0,
      failed: 0,
      removed: 0,
      documents: [{ file: "src/a.ts", status: "confirmed" as const }],
    };
    const manager = {
      clearAllPullResultIds: vi.fn(),
      notifyWorkspaceFileChanges: vi.fn(),
      refreshOpenDiagnostics: vi
        .fn()
        .mockResolvedValueOnce(firstEvidence)
        .mockResolvedValueOnce(finalEvidence),
      getOutstandingDiagnostics: vi.fn(() => [
        { file: "/project/src/a.ts", diagnostics: [makeDiagnostic("Cannot find module 'x'")] },
        { file: "/project/src/b.ts", diagnostics: [makeDiagnostic("Cannot find module 'y'")] },
        { file: "/project/src/c.ts", diagnostics: [makeDiagnostic("Cannot find module 'z'")] },
      ]),
      restartClientsForFiles: vi.fn().mockResolvedValue([
        {
          key: "typescript:/project",
          serverName: "typescript",
          files: ["/project/src/a.ts", "/project/src/b.ts", "/project/src/c.ts"],
          restarted: true,
        },
      ]),
      getRunningClientCount: vi.fn(() => 1),
      getRunningClientNames: vi.fn(() => ["typescript"]),
      isDiagnosticFile: vi.fn(() => true),
      getClientDiagnosticRoutes: vi.fn(() => [
        {
          key: "typescript:/project",
          supportsPull: false,
          unconfirmedFiles: ["/project/src/a.ts", "/project/src/b.ts", "/project/src/c.ts"],
          stallSignal: "readiness-stall" as const,
        },
      ]),
      getDiagnosticEvidence: vi.fn(() => emptyEvidence()),
      getCwd: vi.fn(() => "/project"),
    };

    const result = await recoverWorkspaceDiagnostics(manager as never, {
      restartIfStillStale: true,
    });

    expect(result.diagnosticEvidence).toMatchObject({
      requested: 3,
      confirmed: 1,
      unconfirmed: 0,
      failed: 0,
      removed: 2,
      documents: [
        { file: "src/a.ts", status: "confirmed" },
        { file: "src/b.ts", status: "removed" },
        { file: "src/c.ts", status: "removed" },
      ],
    });
    expect(result.restartReason).toBe("readiness-stall");
    expect(manager.refreshOpenDiagnostics).toHaveBeenCalledTimes(2);
  });

  it("does not retain confirmed evidence when replacement refresh fails", async () => {
    const confirmed = {
      requested: 1,
      confirmed: 1,
      unconfirmed: 0,
      failed: 0,
      removed: 0,
      documents: [{ file: "src/a.ts", status: "confirmed" as const }],
    };
    const manager = {
      clearAllPullResultIds: vi.fn(),
      notifyWorkspaceFileChanges: vi.fn(),
      refreshOpenDiagnostics: vi
        .fn()
        .mockResolvedValueOnce(confirmed)
        .mockRejectedValueOnce(new Error("replacement failed")),
      getOutstandingDiagnostics: vi.fn(() => [
        { file: "/project/src/a.ts", diagnostics: [makeDiagnostic("Cannot find module 'x'")] },
        { file: "/project/src/b.ts", diagnostics: [makeDiagnostic("Cannot find module 'y'")] },
        { file: "/project/src/c.ts", diagnostics: [makeDiagnostic("Cannot find module 'z'")] },
      ]),
      restartClientsForFiles: vi.fn().mockResolvedValue([
        {
          key: "typescript:/project",
          serverName: "typescript",
          files: [
            "/project/src/a.ts",
            "/project/src/b.ts",
            "/project/src/c.ts",
            "/project/node_modules/dependency.ts",
          ],
          restarted: true,
        },
      ]),
      getRunningClientCount: vi.fn(() => 1),
      getRunningClientNames: vi.fn(() => ["typescript"]),
      isDiagnosticFile: vi.fn((file: string) => !file.includes("node_modules")),
      getClientDiagnosticRoutes: vi.fn(() => [
        {
          key: "typescript:/project",
          supportsPull: false,
          unconfirmedFiles: ["/project/src/a.ts"],
          stallSignal: "protocol-errors" as const,
        },
      ]),
      getDiagnosticEvidence: vi.fn(() => emptyEvidence()),
      getCwd: vi.fn(() => "/project"),
    };

    const result = await recoverWorkspaceDiagnostics(manager as never, {
      restartIfStillStale: true,
    });

    expect(result.diagnosticEvidence).toMatchObject({
      confirmed: 0,
      unconfirmed: 0,
      failed: 0,
      removed: 3,
    });
    expect(result.restartReason).toBe("protocol-errors");
    expect(result.diagnosticEvidence.documents).not.toContainEqual(
      expect.objectContaining({ file: "node_modules/dependency.ts" }),
    );
  });

  it("reports an initial refresh failure with preserved evidence", async () => {
    const evidence = {
      requested: 1,
      confirmed: 0,
      unconfirmed: 0,
      failed: 1,
      removed: 0,
      documents: [{ file: "src/a.ts", status: "failed" as const }],
    };
    const manager = {
      clearAllPullResultIds: vi.fn(),
      notifyWorkspaceFileChanges: vi.fn(),
      refreshOpenDiagnostics: vi.fn().mockRejectedValue(new Error("refresh failed")),
      getOutstandingDiagnostics: vi.fn().mockReturnValue([]),
      restartClientsForFiles: vi.fn().mockResolvedValue([]),
      getRunningClientCount: vi.fn(() => 1),
      getRunningClientNames: vi.fn(() => ["typescript"]),
      isDiagnosticFile: vi.fn(() => true),
      getClientDiagnosticRoutes: vi.fn(() => []),
      getDiagnosticEvidence: vi.fn(() => evidence),
      getCwd: vi.fn(() => "/project"),
    };

    const result = await recoverWorkspaceDiagnostics(manager as never, {
      restartIfStillStale: false,
    });

    expect(result).toMatchObject({
      attemptedClients: 1,
      diagnosticEvidence: evidence,
      refreshFailureReason: "refresh failed",
    });
  });

  it("invalidates every document owned by a failed replacement", async () => {
    const confirmed = {
      requested: 4,
      confirmed: 4,
      unconfirmed: 0,
      failed: 0,
      removed: 0,
      documents: [
        { file: "src/a.ts", status: "confirmed" as const },
        { file: "src/b.ts", status: "confirmed" as const },
        { file: "src/c.ts", status: "confirmed" as const },
        { file: "src/d.ts", status: "confirmed" as const },
      ],
    };
    const manager = {
      clearAllPullResultIds: vi.fn(),
      notifyWorkspaceFileChanges: vi.fn(),
      refreshOpenDiagnostics: vi.fn().mockResolvedValue(confirmed),
      getOutstandingDiagnostics: vi.fn(() => [
        { file: "/project/src/a.ts", diagnostics: [makeDiagnostic("Cannot find module 'a'")] },
        { file: "/project/src/b.ts", diagnostics: [makeDiagnostic("Cannot find module 'b'")] },
        { file: "/project/src/c.ts", diagnostics: [makeDiagnostic("Cannot find module 'c'")] },
      ]),
      restartClientsForFiles: vi.fn().mockResolvedValue([
        {
          key: "typescript:/project",
          serverName: "typescript",
          files: [
            "/project/src/a.ts",
            "/project/src/b.ts",
            "/project/src/c.ts",
            "/project/src/d.ts",
          ],
          restarted: false,
        },
      ]),
      getRunningClientCount: vi.fn(() => 1),
      getRunningClientNames: vi.fn(() => ["typescript"]),
      isDiagnosticFile: vi.fn(() => true),
      getClientDiagnosticRoutes: vi.fn(() => [
        {
          key: "typescript:/project",
          supportsPull: false,
          unconfirmedFiles: ["/project/src/a.ts"],
          stallSignal: "readiness-stall" as const,
        },
      ]),
      getDiagnosticEvidence: vi.fn(() => confirmed),
      getCwd: vi.fn(() => "/project"),
    };

    const result = await recoverWorkspaceDiagnostics(manager as never, {
      restartIfStillStale: true,
    });

    expect(result).toMatchObject({
      restartedClients: 0,
      diagnosticEvidence: {
        requested: 4,
        confirmed: 0,
        unconfirmed: 0,
        failed: 0,
        removed: 4,
      },
    });
  });

  it("clears cached pull ids, notifies clients, and refreshes open diagnostics", async () => {
    const manager = {
      clearAllPullResultIds: vi.fn(),
      notifyWorkspaceFileChanges: vi.fn(),
      refreshOpenDiagnostics: vi.fn().mockResolvedValue(emptyEvidence()),
      getOutstandingDiagnostics: vi.fn().mockReturnValue([]),
      restartClientsForFiles: vi.fn().mockResolvedValue([]),
      getRunningClientCount: vi.fn(() => 2),
      getRunningClientNames: vi.fn(() => ["typescript"]),
      isDiagnosticFile: vi.fn(() => true),
      getClientDiagnosticRoutes: vi.fn(() => []),
      getDiagnosticEvidence: vi.fn(() => emptyEvidence()),
      getCwd: vi.fn(() => "/project"),
    };

    const result = await recoverWorkspaceDiagnostics(manager as never, {
      changes: [{ uri: "file:///project/package.json", type: FileChangeType.Changed }],
      restartIfStillStale: false,
      maxWaitMs: 4_000,
      quietMs: 250,
    });

    expect(manager.clearAllPullResultIds).toHaveBeenCalledTimes(1);
    expect(manager.notifyWorkspaceFileChanges).toHaveBeenCalledWith([
      { uri: "file:///project/package.json", type: FileChangeType.Changed },
    ]);
    expect(manager.refreshOpenDiagnostics).toHaveBeenCalledWith({ maxWaitMs: 4_000, quietMs: 250 });
    expect(manager.restartClientsForFiles).not.toHaveBeenCalled();
    expect(result.attemptedClients).toBe(2);
    expect(result.restartedClients).toBe(0);
    expect(result.staleAssessment.suspected).toBe(false);
  });

  it("does not restart clients on stale clusters or unconfirmed evidence alone", async () => {
    const manager = {
      clearAllPullResultIds: vi.fn(),
      notifyWorkspaceFileChanges: vi.fn(),
      refreshOpenDiagnostics: vi.fn().mockResolvedValue(emptyEvidence()),
      getOutstandingDiagnostics: vi.fn(() => [
        {
          file: "/project/src/a.ts",
          diagnostics: [makeDiagnostic("Cannot find module '@supabase/ssr'")],
        },
        {
          file: "/project/src/b.ts",
          diagnostics: [makeDiagnostic("Cannot find module '@tanstack/react-query'")],
        },
        {
          file: "/project/src/c.ts",
          diagnostics: [makeDiagnostic("Cannot find module 'vitest'")],
        },
      ]),
      restartClientsForFiles: vi.fn().mockResolvedValue([]),
      getRunningClientCount: vi.fn(() => 1),
      getRunningClientNames: vi.fn(() => ["typescript"]),
      isDiagnosticFile: vi.fn(() => true),
      getClientDiagnosticRoutes: vi.fn(() => [
        {
          key: "typescript:/project",
          supportsPull: false,
          unconfirmedFiles: ["/project/src/a.ts", "/project/src/b.ts", "/project/src/c.ts"],
          stallSignal: null,
        },
      ]),
      getDiagnosticEvidence: vi.fn(() => emptyEvidence()),
      getCwd: vi.fn(() => "/project"),
    };

    const result = await recoverWorkspaceDiagnostics(manager as never, {
      restartIfStillStale: true,
      changes: [],
    });

    expect(manager.restartClientsForFiles).not.toHaveBeenCalled();
    expect(manager.refreshOpenDiagnostics).toHaveBeenCalledTimes(1);
    expect(result.restartedClients).toBe(0);
    expect(result.staleAssessment.suspected).toBe(true);
  });

  it("restarts a push-only client on a stall signal and records the reason", async () => {
    const manager = {
      clearAllPullResultIds: vi.fn(),
      notifyWorkspaceFileChanges: vi.fn(),
      refreshOpenDiagnostics: vi.fn().mockResolvedValue(emptyEvidence()),
      getOutstandingDiagnostics: vi.fn(() => []),
      restartClientsForFiles: vi.fn().mockResolvedValue([
        {
          key: "typescript:/project",
          serverName: "typescript",
          files: ["/project/src/a.ts"],
          restarted: true,
        },
      ]),
      getRunningClientCount: vi.fn(() => 1),
      getRunningClientNames: vi.fn(() => ["typescript"]),
      isDiagnosticFile: vi.fn(() => true),
      getClientDiagnosticRoutes: vi.fn(() => [
        {
          key: "typescript:/project",
          supportsPull: false,
          unconfirmedFiles: ["/project/src/a.ts"],
          stallSignal: "readiness-stall" as const,
        },
      ]),
      getDiagnosticEvidence: vi.fn(() => emptyEvidence()),
      getCwd: vi.fn(() => "/project"),
    };

    const result = await recoverWorkspaceDiagnostics(manager as never, {
      restartIfStillStale: true,
      changes: [],
    });

    expect(manager.restartClientsForFiles).toHaveBeenCalledWith(["/project/src/a.ts"], {
      pushOnly: true,
    });
    expect(manager.refreshOpenDiagnostics).toHaveBeenCalledTimes(2);
    expect(result.restartedClients).toBe(1);
    expect(result.restartReason).toBe("readiness-stall");
    expect(result.staleAssessment.suspected).toBe(false);
  });

  it("restarts only unconfirmed push-only routes", async () => {
    const unconfirmed = {
      requested: 1,
      confirmed: 0,
      unconfirmed: 1,
      failed: 0,
      removed: 0,
      documents: [{ file: "src/a.ts", status: "unconfirmed" as const }],
    };
    const manager = {
      clearAllPullResultIds: vi.fn(),
      notifyWorkspaceFileChanges: vi.fn(),
      refreshOpenDiagnostics: vi.fn().mockResolvedValue(unconfirmed),
      getOutstandingDiagnostics: vi.fn().mockReturnValue([]),
      restartClientsForFiles: vi.fn().mockResolvedValue([]),
      getRunningClientCount: vi.fn(() => 3),
      getRunningClientNames: vi.fn(() => ["typescript"]),
      isDiagnosticFile: vi.fn(() => true),
      getClientDiagnosticRoutes: vi.fn(() => [
        {
          key: "typescript:/project",
          supportsPull: false,
          unconfirmedFiles: ["/project/src/a.ts"],
          stallSignal: "protocol-errors" as const,
        },
        {
          key: "rust:/project",
          supportsPull: true,
          unconfirmedFiles: ["/project/src/main.rs"],
          stallSignal: "readiness-stall" as const,
        },
        {
          key: "typescript:/project/lib",
          supportsPull: false,
          unconfirmedFiles: [],
          stallSignal: "readiness-stall" as const,
        },
        {
          key: "typescript:/project/other",
          supportsPull: false,
          unconfirmedFiles: ["/project/src/other.ts"],
          stallSignal: null,
        },
      ]),
      getDiagnosticEvidence: vi.fn(() => emptyEvidence()),
      getCwd: vi.fn(() => "/project"),
    };

    const result = await recoverWorkspaceDiagnostics(manager as never, {
      restartIfStillStale: true,
    });

    expect(manager.restartClientsForFiles).toHaveBeenCalledWith(["/project/src/a.ts"], {
      pushOnly: true,
    });
    expect(result.restartedClients).toBe(0);
  });

  it("records elapsed time for the recovery pass", async () => {
    const manager = {
      clearAllPullResultIds: vi.fn(),
      notifyWorkspaceFileChanges: vi.fn(),
      refreshOpenDiagnostics: vi.fn().mockResolvedValue(emptyEvidence()),
      getOutstandingDiagnostics: vi.fn().mockReturnValue([]),
      restartClientsForFiles: vi.fn().mockResolvedValue([]),
      getRunningClientCount: vi.fn(() => 1),
      getRunningClientNames: vi.fn(() => ["typescript"]),
      isDiagnosticFile: vi.fn(() => true),
      getClientDiagnosticRoutes: vi.fn(() => []),
      getDiagnosticEvidence: vi.fn(() => emptyEvidence()),
      getCwd: vi.fn(() => "/project"),
    };

    const result = await recoverWorkspaceDiagnostics(manager as never, {
      restartIfStillStale: false,
    });

    expect(typeof result.elapsedMs).toBe("number");
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("stops before restart escalation when the request is cancelled during the first refresh", async () => {
    const controller = new AbortController();
    let resolveFirstRefresh!: (evidence: unknown) => void;
    const firstRefresh = new Promise((resolve) => {
      resolveFirstRefresh = resolve;
    });
    const manager = {
      clearAllPullResultIds: vi.fn(),
      notifyWorkspaceFileChanges: vi.fn(),
      refreshOpenDiagnostics: vi.fn().mockReturnValueOnce(firstRefresh),
      getOutstandingDiagnostics: vi.fn().mockReturnValue([]),
      restartClientsForFiles: vi.fn().mockResolvedValue([]),
      getRunningClientCount: vi.fn(() => 1),
      getRunningClientNames: vi.fn(() => ["typescript"]),
      isDiagnosticFile: vi.fn(() => true),
      getClientDiagnosticRoutes: vi.fn(() => [
        { key: "typescript:/project", supportsPull: false, unconfirmedFiles: ["src/a.ts"] },
      ]),
      getDiagnosticEvidence: vi.fn(() => emptyEvidence()),
      getCwd: vi.fn(() => "/project"),
    };

    const pending = recoverWorkspaceDiagnostics(manager as never, {
      restartIfStillStale: true,
      control: { signal: controller.signal },
    });
    controller.abort(new Error("cancelled mid-pass"));
    resolveFirstRefresh(emptyEvidence());

    await expect(pending).rejects.toThrow("cancelled mid-pass");
    expect(manager.restartClientsForFiles).not.toHaveBeenCalled();
  });

  it("discards replacement refresh evidence when the request is cancelled after client restart", async () => {
    const controller = new AbortController();
    const unconfirmed = {
      requested: 1,
      confirmed: 0,
      unconfirmed: 1,
      failed: 0,
      removed: 0,
      documents: [{ file: "src/a.ts", status: "unconfirmed" as const }],
    };
    const confirmed = {
      requested: 1,
      confirmed: 1,
      unconfirmed: 0,
      failed: 0,
      removed: 0,
      documents: [{ file: "src/a.ts", status: "confirmed" as const }],
    };
    let resolveReplacementRefresh!: (evidence: unknown) => void;
    const replacementRefresh = new Promise((resolve) => {
      resolveReplacementRefresh = resolve;
    });
    const manager = {
      clearAllPullResultIds: vi.fn(),
      notifyWorkspaceFileChanges: vi.fn(),
      refreshOpenDiagnostics: vi
        .fn()
        .mockResolvedValueOnce(unconfirmed)
        .mockReturnValueOnce(replacementRefresh),
      getOutstandingDiagnostics: vi.fn().mockReturnValue([]),
      restartClientsForFiles: vi.fn().mockResolvedValue([
        {
          key: "typescript:/project",
          serverName: "typescript",
          files: ["/project/src/a.ts"],
          restarted: true,
        },
      ]),
      getRunningClientCount: vi.fn(() => 1),
      getRunningClientNames: vi.fn(() => ["typescript"]),
      isDiagnosticFile: vi.fn(() => true),
      getClientDiagnosticRoutes: vi.fn(() => [
        {
          key: "typescript:/project",
          supportsPull: false,
          unconfirmedFiles: ["/project/src/a.ts"],
          stallSignal: "readiness-stall" as const,
        },
      ]),
      getDiagnosticEvidence: vi.fn(() => emptyEvidence()),
      getCwd: vi.fn(() => "/project"),
    };

    const pending = recoverWorkspaceDiagnostics(manager as never, {
      restartIfStillStale: true,
      control: { signal: controller.signal },
    });
    await vi.waitFor(() => {
      expect(manager.refreshOpenDiagnostics).toHaveBeenCalledTimes(2);
    });
    controller.abort(new Error("cancelled mid-pass"));
    resolveReplacementRefresh(confirmed);

    await expect(pending).rejects.toThrow("cancelled mid-pass");
    expect(manager.restartClientsForFiles).toHaveBeenCalledWith(["/project/src/a.ts"], {
      pushOnly: true,
      control: { signal: controller.signal },
    });
  });

  it("rejects immediately when the request was already cancelled", async () => {
    const controller = new AbortController();
    controller.abort(new Error("cancelled before start"));
    const manager = {
      clearAllPullResultIds: vi.fn(),
      notifyWorkspaceFileChanges: vi.fn(),
      refreshOpenDiagnostics: vi.fn().mockResolvedValue(emptyEvidence()),
      getOutstandingDiagnostics: vi.fn().mockReturnValue([]),
      restartClientsForFiles: vi.fn().mockResolvedValue([]),
      getRunningClientCount: vi.fn(() => 1),
      getRunningClientNames: vi.fn(() => ["typescript"]),
      isDiagnosticFile: vi.fn(() => true),
      getClientDiagnosticRoutes: vi.fn(() => []),
      getDiagnosticEvidence: vi.fn(() => emptyEvidence()),
      getCwd: vi.fn(() => "/project"),
    };

    await expect(
      recoverWorkspaceDiagnostics(manager as never, {
        restartIfStillStale: true,
        control: { signal: controller.signal },
      }),
    ).rejects.toThrow("cancelled before start");
    expect(manager.clearAllPullResultIds).not.toHaveBeenCalled();
    expect(manager.refreshOpenDiagnostics).not.toHaveBeenCalled();
    expect(manager.restartClientsForFiles).not.toHaveBeenCalled();
  });

  it("rejects when the deadline elapsed before the pass started", async () => {
    const manager = {
      clearAllPullResultIds: vi.fn(),
      notifyWorkspaceFileChanges: vi.fn(),
      refreshOpenDiagnostics: vi.fn().mockResolvedValue(emptyEvidence()),
      getOutstandingDiagnostics: vi.fn().mockReturnValue([]),
      restartClientsForFiles: vi.fn().mockResolvedValue([]),
      getRunningClientCount: vi.fn(() => 1),
      getRunningClientNames: vi.fn(() => ["typescript"]),
      isDiagnosticFile: vi.fn(() => true),
      getClientDiagnosticRoutes: vi.fn(() => []),
      getDiagnosticEvidence: vi.fn(() => emptyEvidence()),
      getCwd: vi.fn(() => "/project"),
    };

    await expect(
      recoverWorkspaceDiagnostics(manager as never, {
        restartIfStillStale: true,
        control: { deadline: Date.now() - 1 },
      }),
    ).rejects.toThrow("Code request deadline exceeded");
    expect(manager.clearAllPullResultIds).not.toHaveBeenCalled();
  });

  it("rejects after the first refresh when cancelled without restart escalation", async () => {
    const controller = new AbortController();
    let resolveFirstRefresh!: (evidence: unknown) => void;
    const firstRefresh = new Promise((resolve) => {
      resolveFirstRefresh = resolve;
    });
    const manager = {
      clearAllPullResultIds: vi.fn(),
      notifyWorkspaceFileChanges: vi.fn(),
      refreshOpenDiagnostics: vi.fn().mockReturnValueOnce(firstRefresh),
      getOutstandingDiagnostics: vi.fn().mockReturnValue([]),
      restartClientsForFiles: vi.fn(),
      getRunningClientCount: vi.fn(() => 1),
      getRunningClientNames: vi.fn(() => ["typescript"]),
      isDiagnosticFile: vi.fn(() => true),
      getClientDiagnosticRoutes: vi.fn(() => []),
      getDiagnosticEvidence: vi.fn(() => emptyEvidence()),
      getCwd: vi.fn(() => "/project"),
    };

    const pending = recoverWorkspaceDiagnostics(manager as never, {
      restartIfStillStale: false,
      control: { signal: controller.signal },
    });
    controller.abort(new Error("cancelled mid-pass"));
    resolveFirstRefresh(emptyEvidence());

    await expect(pending).rejects.toThrow("cancelled mid-pass");
    expect(manager.refreshOpenDiagnostics).toHaveBeenCalledTimes(1);
    expect(manager.restartClientsForFiles).not.toHaveBeenCalled();
  });
});

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
