import { describe, expect, it } from "vitest";
import type { HealthData } from "../../../../src/session/health-types.ts";
import { renderHealthResult } from "../../../../src/tool/code_health/markdown.ts";
import { assembleHealthResult } from "../../../../src/tool/code_health/result.ts";

function cleanEvidence() {
  return {
    requested: 0,
    confirmed: 0,
    unconfirmed: 0,
    failed: 0,
    removed: 0,
    documents: [],
  } as const;
}

function fileEvidence(status: "confirmed" | "unconfirmed" | "failed") {
  return {
    requested: 1,
    confirmed: status === "confirmed" ? 1 : 0,
    unconfirmed: status === "unconfirmed" ? 1 : 0,
    failed: status === "failed" ? 1 : 0,
    removed: 0,
    documents: [{ file: "/repo/src/a.ts", status }],
  } as const;
}

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
      evidence: cleanEvidence(),
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
        evidence: cleanEvidence(),
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
          evidence: cleanEvidence(),
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
      evidence: cleanEvidence(),
    });
    expect(markdown).toContain("tracked-file diagnostic snapshot");
    expect(markdown).toContain(
      "No errors or warnings are reported by the tracked-file diagnostic snapshot.",
    );
    expect(markdown).not.toContain("No diagnostics found");
  });

  it("does not duplicate punctuation in a partial diagnostic reason", () => {
    const assembly = assembleHealthResult(
      makeHealthData({
        diagnostics: {
          kind: "partial",
          scope: { kind: "file", path: "/repo/src/a.ts" },
          entries: [],
          evidence: fileEvidence("unconfirmed"),
          reason: "Fresh diagnostics were not confirmed.",
        },
      }),
    );

    const markdown = renderHealthResult(assembly, "/repo");

    expect(markdown).toContain(
      "Diagnostics partially collected — Fresh diagnostics were not confirmed.",
    );
    expect(markdown).toContain(
      "Evidence coverage**: 1 requested, 0 confirmed, 1 unconfirmed, 0 failed, 0 removed.",
    );
    expect(markdown).not.toContain("confirmed..");
  });

  it("keeps a failed file diagnostic query unavailable despite semantic readiness", () => {
    const assembly = assembleHealthResult(
      makeHealthData({
        diagnostics: {
          kind: "unavailable",
          scope: { kind: "file", path: "/repo/src/a.ts" },
          entries: [],
          evidence: fileEvidence("failed"),
          reason: "file request failed",
        },
      }),
    );
    const markdown = renderHealthResult(assembly, "/repo");

    expect(assembly.details.sections[0]).toMatchObject({ status: "unavailable", available: false });
    expect(markdown).toContain("Diagnostics unavailable — file request failed.");
    expect(markdown).not.toContain("No errors or warnings found for");
  });

  it("does not duplicate punctuation in dynamic refresh text", () => {
    const assembly = assembleHealthResult(
      makeHealthData({
        refresh: {
          kind: "completed",
          attemptedAt: 1,
          elapsedMs: 1,
          requestedDiagnosticScope: { kind: "tracked-files", filter: null },
          operationScope: "workspace-runtime",
          attemptedActiveClients: 1,
          restartedClients: 0,
          diagnosticEvidence: cleanEvidence(),
          staleAssessment: {
            scope: "workspace",
            suspected: true,
            matchedFileCount: 3,
            warning: "Stale diagnostics may remain.",
          },
        },
      }),
    );

    const markdown = renderHealthResult(assembly, "/repo");
    expect(markdown).toContain("Stale diagnostics may remain.");
    expect(markdown).not.toContain("remain..");
  });

  it("discloses when file refresh did not assess workspace clustering", () => {
    const assembly = assembleHealthResult(
      makeHealthData({
        refresh: {
          kind: "completed",
          attemptedAt: 1,
          elapsedMs: 1,
          requestedDiagnosticScope: { kind: "file", path: "/repo/src/a.ts" },
          operationScope: "file-runtime",
          attemptedActiveClients: 1,
          restartedClients: 0,
          staleAssessment: {
            scope: "file",
            suspected: null,
            matchedFileCount: 1,
            warning: null,
          },
        },
      }),
    );

    const markdown = renderHealthResult(assembly, "/repo");
    expect(markdown).toContain("workspace clustering was not assessed");
    expect(markdown).not.toContain("no clustered stale-module pattern is suspected");
  });

  it("projects a completed no-op refresh as an attempted outcome", () => {
    const assembly = assembleHealthResult(
      makeHealthData({
        refresh: {
          kind: "completed",
          attemptedAt: 1,
          elapsedMs: 1,
          requestedDiagnosticScope: { kind: "tracked-files", filter: null },
          operationScope: "workspace-runtime",
          attemptedActiveClients: 0,
          restartedClients: 0,
          diagnosticEvidence: cleanEvidence(),
          staleAssessment: {
            scope: "workspace",
            suspected: false,
            matchedFileCount: 0,
            warning: null,
          },
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

  it("does not duplicate punctuation in a retained failed refresh reason", () => {
    const assembly = assembleHealthResult(
      makeHealthData({
        refresh: {
          kind: "not-requested",
          reason: "Refresh was not requested.",
          lastAttempt: {
            kind: "failed",
            attemptedAt: Date.now(),
            elapsedMs: 1,
            requestedDiagnosticScope: { kind: "file", path: "/repo/src/a.ts" },
            operationScope: "file-runtime",
            reason: "Refresh failed.",
          },
        },
      }),
    );

    const markdown = renderHealthResult(assembly, "/repo");
    expect(markdown).toContain("failed — Refresh failed. Started");
    expect(markdown).not.toContain("failed..");
  });

  it("reports the operation scope for a retained file refresh attempt", () => {
    const assembly = assembleHealthResult(
      makeHealthData({
        refresh: {
          kind: "not-requested",
          reason: "Refresh was not requested.",
          lastAttempt: {
            kind: "completed",
            attemptedAt: Date.now(),
            elapsedMs: 1,
            requestedDiagnosticScope: { kind: "file", path: "/repo/src/a.ts" },
            operationScope: "file-runtime",
            attemptedActiveClients: 1,
            restartedClients: 0,
            staleAssessment: {
              scope: "workspace",
              suspected: false,
              matchedFileCount: 0,
              warning: null,
            },
          },
        },
      }),
    );

    const markdown = renderHealthResult(assembly, "/repo");
    expect(markdown).toContain(
      "**File LSP maintenance**: not requested for this call. Previous attempt completed",
    );
    expect(markdown).toContain("operation scope: file runtime");
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
            elapsedMs: 1,
            requestedDiagnosticScope: { kind: "file", path: "/repo/src/a.ts" },
            operationScope: "workspace-runtime",
            attemptedActiveClients: 1,
            restartedClients: 0,
            diagnosticEvidence: cleanEvidence(),
            staleAssessment: {
              scope: "workspace",
              suspected: false,
              matchedFileCount: 0,
              warning: null,
            },
          },
        },
      }),
    );
    const markdown = renderHealthResult(assembly, "/repo");

    expect(markdown).toContain(
      "**Diagnostic refresh**: not requested for this call. Previous attempt completed",
    );
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
