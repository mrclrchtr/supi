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
      restartClientsForFiles: vi
        .fn()
        .mockResolvedValue([{ key: "typescript:/project", files: [], restarted: true }]),
      getRunningClientCount: vi.fn(() => 1),
      isDiagnosticFile: vi.fn(() => true),
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
          files: ["/project/node_modules/dependency.ts"],
          restarted: true,
        },
      ]),
      getRunningClientCount: vi.fn(() => 1),
      isDiagnosticFile: vi.fn((file: string) => !file.includes("node_modules")),
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
      isDiagnosticFile: vi.fn(() => true),
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
      isDiagnosticFile: vi.fn(() => true),
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
      isDiagnosticFile: vi.fn(() => true),
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

  it("restarts clients when clustered missing-module diagnostics remain after soft recovery", async () => {
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
      restartClientsForFiles: vi.fn().mockResolvedValue([
        { key: "typescript:/project", files: [], restarted: true },
        { key: "typescript:/project/packages/app", files: [], restarted: true },
      ]),
      getRunningClientCount: vi.fn(() => 1),
      isDiagnosticFile: vi.fn(() => true),
      getDiagnosticEvidence: vi.fn(() => emptyEvidence()),
      getCwd: vi.fn(() => "/project"),
    };

    const result = await recoverWorkspaceDiagnostics(manager as never, {
      restartIfStillStale: true,
      changes: [],
    });

    expect(manager.restartClientsForFiles).toHaveBeenCalledWith([
      "/project/src/a.ts",
      "/project/src/b.ts",
      "/project/src/c.ts",
    ]);
    expect(manager.refreshOpenDiagnostics).toHaveBeenCalledTimes(2);
    expect(result.restartedClients).toBe(2);
    expect(result.staleAssessment.suspected).toBe(true);
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
