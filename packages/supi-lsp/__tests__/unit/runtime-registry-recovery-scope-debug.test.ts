import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordDebugEvent: vi.fn(),
}));

vi.mock("@mrclrchtr/supi-core/debug", () => ({
  recordDebugEvent: mocks.recordDebugEvent,
}));

import { createWorkspaceLspRuntimeOwner } from "../../src/session/runtime-registry.ts";

const recoveryResult = {
  attemptedClients: 0,
  restartedClients: 0,
  diagnosticEvidence: {
    requested: 0,
    confirmed: 0,
    unconfirmed: 0,
    failed: 0,
    removed: 0,
    documents: [],
  },
  elapsedMs: 5,
  staleAssessment: { suspected: false, matchedFiles: [], warning: null },
};

const scopeSummary = {
  caseSensitiveFileNames: false,
  counts: { included: 2, excluded: 1, noConfig: 0, outOfTree: 0 },
  basisCounts: { fileNames: 2, "exclude-pattern": 1 },
  entries: [
    { file: "src/a.ts", status: "included", basis: "fileNames" },
    { file: "src/b.ts", status: "included", basis: "fileNames" },
    { file: "src/gen.ts", status: "excluded", basis: "exclude-pattern" },
  ],
  totalFiles: 3,
};

function makeManager() {
  return {
    getCwd: () => "/workspace",
    getRunningClientNames: () => ["typescript"],
    recoverWorkspaceDiagnostics: vi.fn().mockResolvedValue(recoveryResult),
    getScopeDecisionSummary: vi.fn().mockReturnValue(scopeSummary),
  };
}

describe("workspace runtime recovery scope telemetry", () => {
  it("emits one diagnostics.scope event with the aggregate decision summary", async () => {
    const manager = makeManager();
    const { runtime } = createWorkspaceLspRuntimeOwner(manager as never);

    const result = await runtime.recoverDiagnostics({ restartIfStillStale: false });
    expect(result).toBe(recoveryResult);

    const scopeEvents = mocks.recordDebugEvent.mock.calls
      .map((call) => call[0])
      .filter((event) => event.category === "diagnostics.scope");
    expect(scopeEvents).toHaveLength(1);
    expect(scopeEvents[0]).toMatchObject({
      source: "lsp",
      level: "debug",
      category: "diagnostics.scope",
      message: "LSP diagnostic tsconfig scope decisions",
      cwd: "/workspace",
      data: {
        caseSensitiveFileNames: false,
        counts: scopeSummary.counts,
        basisCounts: scopeSummary.basisCounts,
        totalFiles: 3,
        entries: scopeSummary.entries,
      },
    });
  });

  it("keeps the runtime.recovery event alongside the scope event", async () => {
    const manager = makeManager();
    const { runtime } = createWorkspaceLspRuntimeOwner(manager as never);

    await runtime.recoverDiagnostics({ restartIfStillStale: false });

    const categories = mocks.recordDebugEvent.mock.calls
      .map((call) => call[0])
      .map((event) => event.category);
    expect(categories).toContain("runtime.recovery");
    expect(categories).toContain("diagnostics.scope");
  });
});
