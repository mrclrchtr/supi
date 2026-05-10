import { describe, expect, it, vi } from "vitest";
import { recoverWorkspaceDiagnostics } from "../src/manager/manager-workspace-recovery.ts";
import { type Diagnostic, FileChangeType } from "../src/types.ts";

function makeDiagnostic(message: string): Diagnostic {
  return {
    message,
    severity: 1,
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
  };
}

describe("recoverWorkspaceDiagnostics", () => {
  it("clears cached pull ids, notifies clients, and refreshes open diagnostics", async () => {
    const manager = {
      clearAllPullResultIds: vi.fn(),
      notifyWorkspaceFileChanges: vi.fn(),
      refreshOpenDiagnostics: vi.fn().mockResolvedValue(undefined),
      getOutstandingDiagnostics: vi.fn().mockReturnValue([]),
      restartClientsForFiles: vi.fn().mockResolvedValue([]),
      getStatus: vi.fn(() => ({ servers: [{ status: "running" }, { status: "running" }] })),
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
    expect(result.refreshedClients).toBe(2);
    expect(result.restartedClients).toBe(0);
    expect(result.staleAssessment.suspected).toBe(false);
  });

  it("restarts clients when clustered missing-module diagnostics remain after soft recovery", async () => {
    const manager = {
      clearAllPullResultIds: vi.fn(),
      notifyWorkspaceFileChanges: vi.fn(),
      refreshOpenDiagnostics: vi.fn().mockResolvedValue(undefined),
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
      restartClientsForFiles: vi
        .fn()
        .mockResolvedValue(["typescript:/project", "typescript:/project/packages/app"]),
      getStatus: vi.fn(() => ({ servers: [{ status: "running" }] })),
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
