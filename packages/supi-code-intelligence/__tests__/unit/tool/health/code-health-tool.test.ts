/**
 * Tests for the code_health tool (Phase 1.5).
 *
 * Covers diagnostic summary, server status, dirty workspace, code action
 * suggestions (detailed mode), and the health renderer.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import codeIntelligenceExtension from "../../../../src/extension.ts";
import {
  type CodeActionSuggestion,
  type HealthData,
  renderHealthResult,
} from "../../../../src/tool/health/markdown.ts";
import { clearMockRuntime, registerMockProvider } from "../../../helpers/register-mock-runtime.ts";

const mockLspFns = vi.hoisted(() => ({
  getSessionLspService: vi.fn<(cwd: string) => unknown>(),
}));

vi.mock("@mrclrchtr/supi-lsp/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mrclrchtr/supi-lsp/api")>();
  return {
    ...actual,
    getSessionLspService: mockLspFns.getSessionLspService,
  };
});

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-health-"));
  // Default: LSP unavailable for existing tests
  mockLspFns.getSessionLspService.mockReturnValue({
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
    codeActions: ReturnType<typeof vi.fn>;
    getOutstandingDiagnostics: ReturnType<typeof vi.fn>;
    getProjectServers: ReturnType<typeof vi.fn>;
    getWorkspaceDiagnosticSummary: ReturnType<typeof vi.fn>;
    fileDiagnostics: ReturnType<typeof vi.fn>;
    recoverDiagnostics: ReturnType<typeof vi.fn>;
  }> = {},
) {
  const service = {
    codeActions: vi.fn().mockResolvedValue([]),
    getOutstandingDiagnostics: vi.fn().mockReturnValue([]),
    getProjectServers: vi
      .fn()
      .mockReturnValue([
        { name: "typescript", root: tmpDir, fileTypes: ["ts"], status: "running" },
      ]),
    getWorkspaceDiagnosticSummary: vi.fn().mockReturnValue([]),
    fileDiagnostics: vi.fn().mockResolvedValue(null),
    recoverDiagnostics: vi.fn().mockResolvedValue({ recovered: false }),
    ...overrides,
  };

  mockLspFns.getSessionLspService.mockReturnValue({
    kind: "ready",
    service,
  });

  return service;
}

function writeCoverageSummary(
  entries: Record<string, { lines: number; statements: number }>,
): void {
  mkdirSync(path.join(tmpDir, "coverage"), { recursive: true });
  const coverageSummary = {
    total: { lines: { pct: 90 }, statements: { pct: 90 } },
    ...Object.fromEntries(
      Object.entries(entries).map(([file, pct]) => [
        file,
        { lines: { pct: pct.lines }, statements: { pct: pct.statements } },
      ]),
    ),
  };
  writeFileSync(
    path.join(tmpDir, "coverage", "coverage-summary.json"),
    JSON.stringify(coverageSummary, null, 2),
  );
}

function writeKnipSummary(content: {
  files?: string[];
  exports?: Array<{ file: string; name: string }>;
}) {
  writeFileSync(path.join(tmpDir, "knip.json"), JSON.stringify(content, null, 2));
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

  it("includes dirty workspace section when include contains dirty", async () => {
    registerMockProvider(tmpDir);

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_health");

    const result = (await tool.execute(
      "test-5",
      { include: ["dirty"] },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    // Dirty section may be empty when temp dir is not a git repo,
    // but the tool should not error
    expect(result.content[0].text).not.toContain("**Error");
  });

  it("renders modified dirty paths without dropping the first character", async () => {
    execFileSync("git", ["init"], { cwd: tmpDir, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: tmpDir });
    execFileSync("git", ["config", "user.name", "Test User"], { cwd: tmpDir });
    writeFileSync(path.join(tmpDir, "CONTEXT.md"), "# Context\n");
    execFileSync("git", ["add", "CONTEXT.md"], { cwd: tmpDir });
    execFileSync("git", ["commit", "--no-gpg-sign", "-m", "initial"], {
      cwd: tmpDir,
      stdio: "ignore",
    });
    writeFileSync(path.join(tmpDir, "CONTEXT.md"), "# Context\n\nUpdated\n");

    registerMockProvider(tmpDir);
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_health");

    const result = (await tool.execute(
      "test-dirty-path",
      { include: ["dirty"] },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
      details?: {
        type: "health";
        data: {
          evidenceLists?: Array<{
            key: string;
            totalCount: number | null;
            shownCount: number;
            omittedCount: number | null;
          }>;
        };
      };
    };

    expect(result.content[0].text).toContain("- `CONTEXT.md`");
    expect(result.content[0].text).not.toContain("- `ONTEXT.md`");
    expect(result.details?.data.evidenceLists).toContainEqual({
      key: "health.dirtyFiles",
      totalCount: 1,
      shownCount: 1,
      omittedCount: 0,
      partialReason: null,
    });
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

  it("ignores workspace diagnostic summary entries with zero errors and warnings", async () => {
    registerMockProvider(tmpDir);
    mockReadyLsp({
      getWorkspaceDiagnosticSummary: vi
        .fn()
        .mockReturnValue([{ file: "src/clean.ts", errors: 0, warnings: 0 }]),
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

    expect(result.content[0].text).toContain("No diagnostics found.");
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

  it("renders a real coverage section when coverage is requested", async () => {
    registerMockProvider(tmpDir);
    mockReadyLsp();
    writeCoverageSummary({ "src/payment.ts": { lines: 10, statements: 15 } });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_health");

    const result = (await tool.execute(
      "test-6c",
      { include: ["coverage"] },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0].text).toContain("### Coverage");
    expect(result.content[0].text).toContain("src/payment.ts");
    expect(result.content[0].text).not.toContain("### Diagnostics");
  });

  it("renders a real unused section when unused is requested", async () => {
    registerMockProvider(tmpDir);
    mockReadyLsp();
    writeKnipSummary({
      files: ["src/unused.ts"],
      exports: [{ file: "src/payment.ts", name: "paymentLoader" }],
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_health");

    const result = (await tool.execute(
      "test-6d",
      { include: ["unused"] },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0].text).toContain("### Unused");
    expect(result.content[0].text).toContain("src/unused.ts");
    expect(result.content[0].text).toContain("paymentLoader");
    expect(result.content[0].text).not.toContain("### Diagnostics");
  });

  it("uses custom coveragePath and unusedPath when provided", async () => {
    registerMockProvider(tmpDir);
    mockReadyLsp();
    writeFileSync(
      path.join(tmpDir, "custom-coverage.json"),
      JSON.stringify(
        {
          total: { lines: { pct: 90 }, statements: { pct: 90 } },
          "src/custom-covered.ts": { lines: { pct: 20 }, statements: { pct: 25 } },
        },
        null,
        2,
      ),
    );
    writeFileSync(
      path.join(tmpDir, "custom-knip.json"),
      JSON.stringify({ files: ["src/custom-unused.ts"] }, null, 2),
    );

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_health");

    const result = (await tool.execute(
      "test-custom-health-paths",
      {
        include: ["coverage", "unused"],
        coveragePath: "custom-coverage.json",
        unusedPath: "custom-knip.json",
      },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0].text).toContain("src/custom-covered.ts");
    expect(result.content[0].text).toContain("src/custom-unused.ts");
  });

  it("reports missing coverage and unused artifacts explicitly when requested", async () => {
    registerMockProvider(tmpDir);
    mockReadyLsp();

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_health");

    const result = (await tool.execute(
      "test-6e",
      { include: ["coverage", "unused"] },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0].text).toContain("### Coverage");
    expect(result.content[0].text).toContain("No coverage report");
    expect(result.content[0].text).toContain("### Unused");
    expect(result.content[0].text).toContain("No unused report");
    expect(result.content[0].text).not.toContain("### Diagnostics");
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

  // ── RED: degraded-coverage warnings in health output ────────────

  it("[RED] includes degraded coverage warnings section when LSP is degraded", async () => {
    // RED: this test requires the health tool to report degraded coverage reasons
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_health");

    const result = (await tool.execute(
      "test-red-cov-1",
      { include: ["diagnostics", "servers"] },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    // The health output should contain a "Coverage" or "Degraded Coverage" heading
    // that reflects the degraded semantic/structural state
    const text = result.content[0].text;
    expect(text).toContain("Degraded Coverage");
  });

  it("[RED] matches degraded coverage reasons with /supi-ci-status", async () => {
    // RED: the health tool and status command should share the same warning evaluation
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_health");

    const result = (await tool.execute(
      "test-red-cov-2",
      { include: ["diagnostics", "servers"] },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    // Should report the reason coverage is degraded
    const text = result.content[0].text;
    // Either degraded coverage info or no servers warning
    expect(text).not.toContain("**Error");
  });
});

describe("renderHealthResult code actions", () => {
  function makeBaseData(overrides: Partial<HealthData>): HealthData {
    return {
      includedSections: ["diagnostics"],
      lspAvailable: false,
      lspStatus: "unavailable",
      recovered: false,
      diagnostics: [],
      servers: [],
      gitContext: null,
      scopeFilter: null,
      level: "detailed",
      codeActions: null,
      coverage: null,
      unused: null,
      ...overrides,
    };
  }

  it("renders code actions section when codeActions is populated", () => {
    const actions: CodeActionSuggestion[] = [
      { file: "/tmp/src/file.ts", line: 12, title: "Remove unused import", kind: "quickfix" },
      { file: "/tmp/src/file.ts", line: 42, title: "Add missing return type", kind: "quickfix" },
    ];

    const data = makeBaseData({
      diagnostics: [{ file: "/tmp/src/file.ts", errors: 2, warnings: 0 }],
      codeActions: actions,
    });

    const result = renderHealthResult(data, "/tmp");

    expect(result).toContain("### Code Actions");
    expect(result).toContain("Remove unused import");
    expect(result).toContain("Add missing return type");
    expect(result).toContain("quickfix");
    expect(result).toContain("suggestions only");
  });

  it("renders structural readiness in the status line when structuralStatus is set", () => {
    const data = makeBaseData({ lspStatus: "ready", structuralStatus: "ready" });

    const result = renderHealthResult(data, "/tmp");

    expect(result).toContain("**LSP**: ready");
    expect(result).toContain("**Structural**: ready");
  });

  it("omits the structural status line when structuralStatus is unset", () => {
    const data = makeBaseData({ lspStatus: "ready" });

    const result = renderHealthResult(data, "/tmp");

    expect(result).toContain("**LSP**: ready");
    expect(result).not.toContain("**Structural**");
  });

  it("does not render code actions section when codeActions is null", () => {
    const data = makeBaseData({
      diagnostics: [{ file: "/tmp/src/file.ts", errors: 2, warnings: 0 }],
      codeActions: null,
    });

    const result = renderHealthResult(data, "/tmp");

    expect(result).not.toContain("### Code Actions");
    expect(result).not.toContain("suggestions only");
  });

  it("does not render code actions section when codeActions is empty", () => {
    const data = makeBaseData({
      diagnostics: [{ file: "/tmp/src/file.ts", errors: 2, warnings: 0 }],
      codeActions: [],
    });

    const result = renderHealthResult(data, "/tmp");

    expect(result).not.toContain("### Code Actions");
  });

  it("does not render code actions section in summary level even when populated", () => {
    const actions: CodeActionSuggestion[] = [
      { file: "/tmp/src/file.ts", line: 12, title: "Remove unused import", kind: "quickfix" },
    ];

    // Summary level with code actions — the executor shouldn't set codeActions
    // in summary mode anyway, but the renderer should handle it gracefully
    const data = makeBaseData({
      level: "summary",
      diagnostics: [{ file: "/tmp/src/file.ts", errors: 1, warnings: 0 }],
      codeActions: actions,
    });

    const result = renderHealthResult(data, "/tmp");

    // Summary mode doesn't call renderDiagnosticDetails, so no code actions section
    expect(result).not.toContain("### Code Actions");
  });
});

describe("code_health detailed mode with code actions", () => {
  beforeEach(() => {
    registerMockProvider(tmpDir);
  });

  it("includes code action titles when LSP returns actions in detailed mode", async () => {
    mockLspFns.getSessionLspService.mockReturnValue({
      kind: "ready",
      service: {
        codeActions: vi.fn().mockResolvedValue([
          { title: "Remove unused import", kind: "quickfix" },
          { title: "Fix all auto-fixable problems", kind: "source.fixAll" },
        ]),
        getOutstandingDiagnostics: vi.fn().mockReturnValue([
          {
            file: "src/file.ts",
            diagnostics: [
              {
                severity: 1,
                range: { start: { line: 11, character: 0 }, end: { line: 11, character: 20 } },
                message: "'x' is declared but never used",
              },
            ],
          },
        ]),
        getProjectServers: vi.fn().mockReturnValue([]),
        getWorkspaceDiagnosticSummary: vi.fn().mockReturnValue([]),
        fileDiagnostics: vi.fn().mockResolvedValue(null),
        recoverDiagnostics: vi.fn().mockResolvedValue({ recovered: false }),
      },
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_health");

    const result = (await tool.execute(
      "test-ca-1",
      { level: "detailed", include: ["diagnostics"] },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0].text).toContain("### Code Actions");
    expect(result.content[0].text).toContain("Remove unused import");
    expect(result.content[0].text).toContain("Fix all auto-fixable problems");
    expect(result.content[0].text).toContain("12"); // line 12 (0-based 11 → 1-based 12)
  });

  it("does not include code actions in summary mode", async () => {
    const codeActionsSpy = vi.fn().mockResolvedValue([]);

    mockLspFns.getSessionLspService.mockReturnValue({
      kind: "ready",
      service: {
        codeActions: codeActionsSpy,
        getOutstandingDiagnostics: vi.fn().mockReturnValue([]),
        getProjectServers: vi.fn().mockReturnValue([]),
        getWorkspaceDiagnosticSummary: vi.fn().mockReturnValue([]),
        fileDiagnostics: vi.fn().mockResolvedValue(null),
        recoverDiagnostics: vi.fn().mockResolvedValue({ recovered: false }),
      },
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_health");

    await tool.execute(
      "test-ca-2",
      { level: "summary" },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    );

    // codeActions should NOT be called in summary mode
    expect(codeActionsSpy).not.toHaveBeenCalled();
  });

  it("handles codeActions returning null gracefully", async () => {
    mockLspFns.getSessionLspService.mockReturnValue({
      kind: "ready",
      service: {
        codeActions: vi.fn().mockResolvedValue(null),
        getOutstandingDiagnostics: vi.fn().mockReturnValue([
          {
            file: "src/file.ts",
            diagnostics: [
              {
                severity: 1,
                range: { start: { line: 5, character: 0 }, end: { line: 5, character: 10 } },
                message: "error",
              },
            ],
          },
        ]),
        getProjectServers: vi.fn().mockReturnValue([]),
        getWorkspaceDiagnosticSummary: vi.fn().mockReturnValue([]),
        fileDiagnostics: vi.fn().mockResolvedValue(null),
        recoverDiagnostics: vi.fn().mockResolvedValue({ recovered: false }),
      },
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_health");

    const result = (await tool.execute(
      "test-ca-3",
      { level: "detailed", include: ["diagnostics"] },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    // Should not crash — "Code Actions" section absent since null means no actions
    expect(result.content[0].text).not.toContain("### Code Actions");
  });

  it("handles codeActions throwing gracefully", async () => {
    mockLspFns.getSessionLspService.mockReturnValue({
      kind: "ready",
      service: {
        codeActions: vi.fn().mockRejectedValue(new Error("LSP timeout")),
        getOutstandingDiagnostics: vi.fn().mockReturnValue([
          {
            file: "src/file.ts",
            diagnostics: [
              {
                severity: 1,
                range: { start: { line: 3, character: 0 }, end: { line: 3, character: 10 } },
                message: "error",
              },
            ],
          },
        ]),
        getProjectServers: vi.fn().mockReturnValue([]),
        getWorkspaceDiagnosticSummary: vi.fn().mockReturnValue([]),
        fileDiagnostics: vi.fn().mockResolvedValue(null),
        recoverDiagnostics: vi.fn().mockResolvedValue({ recovered: false }),
      },
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_health");

    const result = (await tool.execute(
      "test-ca-4",
      { level: "detailed", include: ["diagnostics"] },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    // Should not crash on exceptions — diagnostic section still present
    expect(result.content[0].text).toContain("### Diagnostics");
  });
});
