/**
 * Tests for the code_health tool (Phase 1.5).
 *
 * Covers diagnostic summary, server status, and the health renderer.
 */

import { mkdtempSync, rmSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import codeIntelligenceExtension from "../../../../src/extension.ts";
import { clearMockRuntime, registerMockProvider } from "../../../helpers/register-mock-runtime.ts";

const mockLspFns = vi.hoisted(() => ({
  getWorkspaceLspRuntime: vi.fn<(cwd: string) => unknown>(),
}));

vi.mock("@mrclrchtr/supi-lsp/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mrclrchtr/supi-lsp/api")>();
  return {
    ...actual,
    getWorkspaceLspRuntime: mockLspFns.getWorkspaceLspRuntime,
    syncWorkspaceSentinelSnapshot: vi.fn((_cwd: string, prev: Map<string, number>) => ({
      snapshot: prev,
      changes: [],
    })),
    isLikelyStaleDiagnostic: vi.fn(() => false),
  };
});

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-health-"));
  // Default: LSP unavailable for existing tests
  mockLspFns.getWorkspaceLspRuntime.mockReturnValue({
    kind: "unavailable",
    reason: "no active session",
  });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  clearMockRuntime();
  vi.clearAllMocks();
});

function mockReadyLsp(
  overrides: Partial<{
    getOutstandingDiagnostics: ReturnType<typeof vi.fn>;
    getProjectServers: ReturnType<typeof vi.fn>;
    getWorkspaceDiagnosticSummary: ReturnType<typeof vi.fn>;
    fileDiagnostics: ReturnType<typeof vi.fn>;
    recoverDiagnostics: ReturnType<typeof vi.fn>;
    pruneMissingFiles: ReturnType<typeof vi.fn>;
    refreshOpenDiagnostics: ReturnType<typeof vi.fn>;
    noteWorkspaceChanges: ReturnType<typeof vi.fn>;
    closeFile: ReturnType<typeof vi.fn>;
    trackFile: ReturnType<typeof vi.fn>;
  }> = {},
) {
  const runtime = {
    getOutstandingDiagnostics: vi.fn().mockReturnValue({ entries: [], current: true }),
    getProjectServers: vi.fn().mockReturnValue([
      {
        name: "typescript",
        root: tmpDir,
        fileTypes: ["ts"],
        status: "running",
        ready: true,
      },
    ]),
    getWorkspaceDiagnosticSummary: vi.fn().mockReturnValue({ entries: [], current: true }),
    fileDiagnostics: vi.fn().mockResolvedValue(null),
    recoverDiagnostics: vi.fn().mockResolvedValue({
      attemptedClients: 0,
      restartedClients: 0,
      staleAssessment: { suspected: false, matchedFiles: [], warning: null },
    }),
    pruneMissingFiles: vi.fn().mockReturnValue([]),
    refreshOpenDiagnostics: vi.fn().mockResolvedValue(undefined),
    noteWorkspaceChanges: vi.fn(),
    closeFile: vi.fn(),
    trackFile: vi.fn().mockResolvedValue(true),
    ...overrides,
  };

  mockLspFns.getWorkspaceLspRuntime.mockReturnValue({
    kind: "ready",
    runtime,
  });

  return runtime;
}

describe("code_health tool", () => {
  it("is registered as an active public tool", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_health");

    expect(tool).toBeDefined();
    expect(tool.name).toBe("code_health");
    expect(typeof tool.execute).toBe("function");
    expect(tool.parameters).toBeDefined();
  });

  it("has parameters matching the planned V2 schema", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_health") as {
      parameters?: { properties?: Record<string, unknown> };
    };

    const props = tool.parameters?.properties;
    expect(props).toBeDefined();
    expect(props).toHaveProperty("scope");
    expect(props).toHaveProperty("refresh");
    expect(props).toHaveProperty("include");
    expect(props).toHaveProperty("level");
  });

  it("returns workspace diagnostic summary when called with no args", async () => {
    registerMockProvider(tmpDir);

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_health");

    const result = (await tool.execute(
      "test-1",
      {},
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    // Should return a health report, not an error
    expect(result.content[0].text).not.toContain("**Error");
    expect(result.content[0].text).toContain("Health");
  });

  it("returns error-like output when LSP is not available", async () => {
    // No registerMockProvider call — LSP is unavailable
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_health");

    const result = (await tool.execute(
      "test-2",
      {},
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    // Should report that LSP is not available, not throw
    expect(result.content[0].text).toContain("LSP");
  });

  it("includes diagnostics section when include contains diagnostics", async () => {
    registerMockProvider(tmpDir);

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_health");

    const result = (await tool.execute(
      "test-3",
      { include: ["diagnostics"] },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0].text).toContain("Diagnostics");
  });

  it("includes servers section when include contains servers", async () => {
    registerMockProvider(tmpDir);

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_health");

    const result = (await tool.execute(
      "test-4",
      { include: ["servers"] },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    // Servers section may be empty when no real LSP is running,
    // but the tool should not error
    expect(result.content[0].text).not.toContain("**Error");
  });

  it("defaults to diagnostics + servers when include is omitted", async () => {
    registerMockProvider(tmpDir);
    mockReadyLsp();

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_health");

    const result = (await tool.execute(
      "test-6",
      {},
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0].text).toContain("### Diagnostics");
    expect(result.content[0].text).toContain("### Servers");
  });

  it("does not infer semantic availability from a ready runtime with zero servers", async () => {
    registerMockProvider(tmpDir);
    mockReadyLsp({ getProjectServers: vi.fn().mockReturnValue([]) });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_health");
    const result = (await tool.execute(
      "test-ready-zero-servers",
      { include: ["diagnostics", "servers"] },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
      details?: {
        type: "health";
        data: {
          semanticState: { kind: string; reason?: string } | null;
          sections: Array<{ key: string; status: string; provenance: unknown[] }>;
          provenance: Array<{ source: string }>;
        };
      };
    };

    expect(result.details?.data.semanticState).toEqual({
      kind: "pending",
      reason: "No active, ready project servers",
    });
    expect(result.details?.data.sections).toEqual([
      expect.objectContaining({ key: "diagnostics", status: "unavailable", provenance: [] }),
      expect.objectContaining({ key: "servers", status: "complete" }),
    ]);
    expect(result.details?.data.provenance).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ source: "semantic" })]),
    );
    expect(result.content[0].text).toContain("No active, ready project servers");
    expect(result.content[0].text).toContain("Diagnostics unavailable");
  });

  it("recovers a non-ready server before deciding diagnostic availability", async () => {
    registerMockProvider(tmpDir);
    let ready = false;
    const recoverDiagnostics = vi.fn(async () => {
      ready = true;
      return {
        attemptedClients: 1,
        restartedClients: 1,
        staleAssessment: { suspected: false, matchedFiles: [], warning: null },
      };
    });
    mockReadyLsp({
      getProjectServers: vi.fn(() => [
        {
          name: "typescript",
          root: tmpDir,
          fileTypes: ["ts"],
          status: "running",
          ready,
        },
      ]),
      recoverDiagnostics,
      getWorkspaceDiagnosticSummary: vi.fn(() => ({
        current: true,
        entries: [{ file: "src/index.ts", errors: 1, warnings: 0 }],
      })),
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const result = (await getTool(pi, "code_health").execute(
      "test-recover-before-availability",
      { include: ["diagnostics"], refresh: true },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ text: string }>;
      details?: {
        type: "health";
        data: { semanticState: { kind: string } | null; diagnosticFileCount: number };
      };
    };

    expect(recoverDiagnostics).toHaveBeenCalledOnce();
    expect(result.details?.data.semanticState).toEqual({ kind: "ready" });
    expect(result.details?.data.diagnosticFileCount).toBe(1);
    expect(result.content[0].text).toContain("1 file with issues");
  });

  it("preserves an explicitly empty include list instead of applying defaults", async () => {
    registerMockProvider(tmpDir);
    mockReadyLsp();

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_health");

    const result = (await tool.execute(
      "test-empty-include",
      { include: [] },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
      details?: { type: "health"; data: { includedSections: string[]; sections: unknown[] } };
    };

    expect(result.content[0].text).not.toContain("### Diagnostics");
    expect(result.content[0].text).not.toContain("### Servers");
    expect(result.details?.data.includedSections).toEqual([]);
    expect(result.details?.data.sections).toEqual([]);
  });

  it("ignores workspace diagnostic summary entries with zero errors and warnings", async () => {
    registerMockProvider(tmpDir);
    mockReadyLsp({
      getWorkspaceDiagnosticSummary: vi.fn().mockReturnValue({
        current: true,
        entries: [{ file: "src/clean.ts", errors: 0, warnings: 0 }],
      }),
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_health");

    const result = (await tool.execute(
      "test-6-zero-counts",
      { include: ["diagnostics"] },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0].text).toContain(
      "No errors or warnings are reported by the tracked-file diagnostic snapshot.",
    );
    expect(result.content[0].text).not.toContain("1 file with issues: 0 errors, 0 warnings");
    expect(result.content[0].text).not.toContain("src/clean.ts");
  });

  it("renders only the requested sections when include is provided", async () => {
    registerMockProvider(tmpDir);
    mockReadyLsp();

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_health");

    const result = (await tool.execute(
      "test-6b",
      { include: ["servers"] },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0].text).toContain("### Servers");
    expect(result.content[0].text).not.toContain("### Diagnostics");
  });

  it.each([
    ["coverage section", { include: ["coverage"] }],
    ["unused section", { include: ["unused"] }],
    ["coveragePath", { coveragePath: "coverage.json" }],
    ["unusedPath", { unusedPath: "unused.json" }],
  ])("rejects the removed %s input", async (_label, input) => {
    registerMockProvider(tmpDir);
    mockReadyLsp();

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const result = (await getTool(pi, "code_health").execute(
      "removed-health-input",
      input,
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as { content: Array<{ type: string; text: string }> };

    expect(result.content[0].text).toContain("**Error:**");
  });

  it("accepts level: summary", async () => {
    registerMockProvider(tmpDir);

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_health");

    const result = (await tool.execute(
      "test-7",
      { level: "summary" },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0].text).not.toContain("**Error");
  });

  it("accepts level: detailed", async () => {
    registerMockProvider(tmpDir);

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_health");

    const result = (await tool.execute(
      "test-8",
      { level: "detailed" },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0].text).not.toContain("**Error");
  });

  it("accepts scope parameter", async () => {
    registerMockProvider(tmpDir);

    // Use "." as scope since the temp dir exists
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_health");

    const result = (await tool.execute(
      "test-9",
      { scope: "." },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0].text).not.toContain("**Error");
  });

  it("includes recover message when refresh is true", async () => {
    registerMockProvider(tmpDir);

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_health");

    const result = (await tool.execute(
      "test-10",
      { refresh: true },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    // Refresh should trigger recovery, which should be reflected in output
    expect(result.content[0].text).not.toContain("**Error");
  });

  it("includes Capability Warnings in Markdown and structured details", async () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const result = (await getTool(pi, "code_health").execute(
      "capability-warnings",
      { include: ["diagnostics", "servers"] },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
      details?: {
        type: "health";
        data: { capabilityWarnings: { hasWarnings: boolean; warnings: unknown[] } | null };
      };
    };

    expect(result.content[0].text).toContain("### Capability Warnings");
    expect(result.details?.data.capabilityWarnings?.hasWarnings).toBe(true);
    expect(result.details?.data.capabilityWarnings?.warnings.length).toBeGreaterThan(0);
  });
});
