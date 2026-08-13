import { describe, expect, it } from "vitest";
import type { HealthData } from "../../../../src/session/health-types.ts";
import { renderHealthResult } from "../../../../src/tool/health/markdown.ts";
import { assembleHealthResult } from "../../../../src/tool/result/health.ts";

function makeHealthData(overrides: Partial<HealthData> = {}): HealthData {
  return {
    includedSections: ["diagnostics", "servers"],
    semanticState: { kind: "ready" },
    serverInventoryAvailable: true,
    structuralAvailable: false,
    structuralStatus: "unavailable — no tree-sitter",
    diagnostics: {
      kind: "completed",
      scope: { kind: "tracked-files", filter: null },
      entries: [],
    },
    servers: [],
    refresh: {
      kind: "not-requested",
      reason: "Refresh was not requested.",
      lastAttempt: null,
    },
    level: "summary",
    ...overrides,
  };
}

describe("code_health result assembly", () => {
  it("separates complete disabled server status from unavailable semantic diagnostics", () => {
    const data = makeHealthData({
      includedSections: ["diagnostics", "servers"],
      semanticState: { kind: "disabled", reason: "Disabled by configuration" },
      diagnostics: {
        kind: "unavailable",
        scope: { kind: "tracked-files", filter: null },
        entries: [],
        reason: "Disabled by configuration",
      },
      servers: [],
    });
    const assembly = assembleHealthResult(data);
    const markdown = renderHealthResult(assembly, "/repo");

    expect(assembly.details.sections).toEqual([
      expect.objectContaining({ key: "diagnostics", status: "unavailable", available: false }),
      expect.objectContaining({
        key: "servers",
        status: "complete",
        available: true,
        confidence: "heuristic",
        provenance: [{ source: "runtime", capability: "language-server-status" }],
      }),
    ]);
    expect(assembly.details.provenance).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ source: "semantic" })]),
    );
    expect(markdown).toContain("**LSP**: disabled — Disabled by configuration");
    expect(markdown).toContain("Diagnostics unavailable");
    expect(markdown).toContain("No servers found.");
    expect(markdown).not.toContain("Server status unavailable");
  });

  it("does not turn an unavailable runtime into a complete empty server inventory", () => {
    const assembly = assembleHealthResult(
      makeHealthData({
        semanticState: { kind: "unavailable", reason: "no LSP session" },
        serverInventoryAvailable: false,
        diagnostics: {
          kind: "unavailable",
          scope: { kind: "tracked-files", filter: null },
          entries: [],
          reason: "no LSP session",
        },
        servers: [],
      }),
    );
    const markdown = renderHealthResult(assembly, "/repo");

    expect(assembly.details.sections).toEqual([
      expect.objectContaining({ key: "diagnostics", status: "unavailable" }),
      expect.objectContaining({ key: "servers", status: "unavailable", available: false }),
    ]);
    expect(markdown).toContain("Server status unavailable");
    expect(markdown).not.toContain("No servers found.");
  });

  it("labels an empty tracked-file snapshot without claiming a clean workspace", () => {
    const assembly = assembleHealthResult(makeHealthData());
    const markdown = renderHealthResult(assembly, "/repo");

    expect(assembly.details.diagnosticObservation).toEqual({
      kind: "completed",
      scope: { kind: "tracked-files", filter: null },
      entries: [],
    });
    expect(markdown).toContain("tracked-file diagnostic snapshot");
    expect(markdown).toContain(
      "No errors or warnings are reported by the tracked-file diagnostic snapshot.",
    );
    expect(markdown).not.toContain("No diagnostics found");
  });

  it("keeps a failed file diagnostic query unavailable despite semantic readiness", () => {
    const assembly = assembleHealthResult(
      makeHealthData({
        diagnostics: {
          kind: "unavailable",
          scope: { kind: "file", path: "/repo/src/a.ts" },
          entries: [],
          reason: "file request failed",
        },
      }),
    );
    const markdown = renderHealthResult(assembly, "/repo");

    expect(assembly.details.sections[0]).toMatchObject({ status: "unavailable", available: false });
    expect(markdown).toContain("Diagnostics unavailable — file request failed.");
    expect(markdown).not.toContain("No errors or warnings found for");
  });

  it("projects a completed no-op refresh as an attempted outcome", () => {
    const assembly = assembleHealthResult(
      makeHealthData({
        refresh: {
          kind: "completed",
          attemptedAt: 1,
          requestedDiagnosticScope: { kind: "tracked-files", filter: null },
          operationScope: "workspace-runtime",
          attemptedActiveClients: 0,
          restartedClients: 0,
          staleAssessment: { suspected: false, matchedFileCount: 0, warning: null },
        },
      }),
    );
    const markdown = renderHealthResult(assembly, "/repo");

    expect(assembly.details.refresh).toMatchObject({
      kind: "completed",
      attemptedActiveClients: 0,
      restartedClients: 0,
    });
    expect(markdown).toContain("Diagnostic refresh attempt**: completed no-op");
    expect(markdown).not.toContain("**Diagnostic refresh**:");
    expect(markdown).not.toContain("recovered");
  });

  it("names retained timing as a refresh attempt rather than diagnostic age", () => {
    const assembly = assembleHealthResult(
      makeHealthData({
        refresh: {
          kind: "not-requested",
          reason: "Refresh was not requested.",
          lastAttempt: {
            kind: "completed",
            attemptedAt: Date.now() - 65_000,
            requestedDiagnosticScope: { kind: "file", path: "/repo/src/a.ts" },
            operationScope: "workspace-runtime",
            attemptedActiveClients: 1,
            restartedClients: 0,
            staleAssessment: { suspected: false, matchedFileCount: 0, warning: null },
          },
        },
      }),
    );
    const markdown = renderHealthResult(assembly, "/repo");

    expect(markdown).toContain("Last diagnostic refresh attempt");
    expect(markdown).toContain("started");
    expect(markdown).not.toContain("Diagnostics are");
  });

  it("projects Capability Warnings into structured details and Markdown", () => {
    const capabilityWarnings = {
      hasWarnings: true,
      warnings: [
        {
          type: "missing-server" as const,
          language: "python",
          message: 'Cannot start "python" server — "pyright-langserver" not found on PATH',
        },
      ],
    };
    const data = makeHealthData({ includedSections: ["servers"], capabilityWarnings });
    const assembly = assembleHealthResult(data);
    const markdown = renderHealthResult(assembly, "/repo");

    expect(assembly.details).toHaveProperty("capabilityWarnings", capabilityWarnings);
    expect(markdown).toContain("### Capability Warnings");
    expect(markdown).toContain("pyright-langserver");
  });
});
