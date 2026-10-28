import type { CapabilityState } from "@mrclrchtr/supi-code-runtime/api";
import type { WorkspaceLspRuntime, WorkspaceLspRuntimeState } from "@mrclrchtr/supi-lsp/api";
import { describe, expect, it, vi } from "vitest";
import { observeWorkspaceStatus } from "../../../../src/analysis/health/status.ts";

function runtime() {
  return {
    getProjectServers: vi.fn(() => [
      {
        name: "typescript",
        root: "/project",
        status: "running",
        ready: true,
        fileTypes: ["ts"],
        openFiles: [],
      },
    ]),
    getWorkspaceDiagnosticSummary: vi.fn(() => ({
      current: true,
      entries: [{ file: "src/warn.ts", errors: 0, warnings: 1 }],
      evidence: {
        requested: 1,
        confirmed: 1,
        unconfirmed: 0,
        failed: 0,
        removed: 0,
        documents: [{ file: "src/warn.ts", status: "confirmed" }],
      },
    })),
    refreshWorkspace: vi.fn(),
    waitUntilReadyForFile: vi.fn(),
  };
}
function observe(
  lspState: WorkspaceLspRuntimeState,
  semanticState: CapabilityState = { kind: "ready" },
) {
  return observeWorkspaceStatus({
    cwd: "/project",
    lspState,
    semanticState,
    structuralState: { kind: "ready" },
    projectTrusted: false,
  });
}

describe("passive workspace status", () => {
  it("retains warning counts and diagnostic confirmation without starting maintenance", async () => {
    const service = runtime();
    const snapshot = await observe(
      { kind: "ready", runtime: service as unknown as WorkspaceLspRuntime },
      { kind: "pending" },
    );
    expect(snapshot.capabilities.semantic).toEqual({ kind: "ready" });
    expect(snapshot.diagnostics).toMatchObject({
      kind: "completed",
      scope: { kind: "tracked-files", filter: null },
      entries: [{ file: "/project/src/warn.ts", errors: 0, warnings: 1 }],
      evidence: { requested: 1, confirmed: 1 },
    });
    expect(service.refreshWorkspace).not.toHaveBeenCalled();
    expect(service.waitUntilReadyForFile).not.toHaveBeenCalled();
  });

  it("orders problems by errors, then warnings, then filename for stable ties", async () => {
    const service = runtime();
    service.getWorkspaceDiagnosticSummary.mockReturnValue({
      ...service.getWorkspaceDiagnosticSummary(),
      entries: [
        { file: "src/z-warn.ts", errors: 0, warnings: 1 },
        { file: "src/mixed.ts", errors: 1, warnings: 2 },
        { file: "src/err.ts", errors: 2, warnings: 0 },
        { file: "src/a-warn.ts", errors: 0, warnings: 1 },
      ],
    });
    const snapshot = await observe({
      kind: "ready",
      runtime: service as unknown as WorkspaceLspRuntime,
    });
    expect(snapshot.diagnostics.entries.map((entry) => entry.file)).toEqual([
      "/project/src/err.ts",
      "/project/src/mixed.ts",
      "/project/src/a-warn.ts",
      "/project/src/z-warn.ts",
    ]);
  });

  it("does not promote a ready broker over an unavailable LSP runtime", async () => {
    const snapshot = await observe({ kind: "unavailable", reason: "runtime stopped" });
    expect(snapshot.capabilities.semantic).toEqual({
      kind: "unavailable",
      reason: "runtime stopped",
    });
    expect(snapshot.diagnostics.kind).toBe("unavailable");
    expect(snapshot.serverInventoryAvailable).toBe(false);
  });

  it("preserves an unavailable capability when a runtime owner has no ready servers", async () => {
    const service = runtime();
    service.getProjectServers.mockReturnValue([]);
    const snapshot = await observe(
      { kind: "ready", runtime: service as unknown as WorkspaceLspRuntime },
      { kind: "unavailable", reason: "provider failed" },
    );
    expect(snapshot.capabilities.semantic).toEqual({
      kind: "unavailable",
      reason: "provider failed",
    });
    expect(snapshot.serverInventoryAvailable).toBe(true);
    expect(snapshot.diagnostics.kind).toBe("unavailable");
  });

  it("preserves snapshot failures as unavailable evidence instead of a clean result", async () => {
    const service = runtime();
    service.getWorkspaceDiagnosticSummary.mockImplementation(() => {
      throw new Error("snapshot failed");
    });
    const snapshot = await observe({
      kind: "ready",
      runtime: service as unknown as WorkspaceLspRuntime,
    });
    expect(snapshot.diagnostics).toMatchObject({
      kind: "unavailable",
      reason: "snapshot failed",
      entries: [],
    });
  });
});
