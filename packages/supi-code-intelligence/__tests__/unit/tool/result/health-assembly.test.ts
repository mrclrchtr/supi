import { describe, expect, it } from "vitest";
import type { HealthData } from "../../../../src/session/health-types.ts";
import { renderHealthResult } from "../../../../src/tool/health/markdown.ts";
import { assembleHealthResult } from "../../../../src/tool/result/health.ts";

function makeHealthData(overrides: Partial<HealthData> = {}): HealthData {
  return {
    includedSections: ["diagnostics", "servers"],
    semanticState: { kind: "ready" },
    serverInventoryAvailable: true,
    recovered: false,
    structuralAvailable: false,
    structuralStatus: "unavailable — no tree-sitter",
    diagnostics: [],
    servers: [],
    scopeFilter: null,
    level: "summary",
    ...overrides,
  };
}

describe("code_health result assembly", () => {
  it("separates complete disabled server status from unavailable semantic diagnostics", () => {
    const data = makeHealthData({
      includedSections: ["diagnostics", "servers"],
      semanticState: { kind: "disabled", reason: "Disabled by configuration" },
      diagnostics: [],
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
        diagnostics: [],
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
