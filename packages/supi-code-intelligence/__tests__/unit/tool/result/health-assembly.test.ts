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
    gitContext: null,
    scopeFilter: null,
    level: "summary",
    ...overrides,
  };
}

describe("code_health result assembly", () => {
  it("assembles only requested sections with evidence-backed provenance", () => {
    const assembly = assembleHealthResult(
      makeHealthData({
        includedSections: ["dirty"],
        semanticState: null,
        gitContext: {
          branch: "main",
          dirtyFiles: ["src/index.ts"],
          lastCommitMessage: "initial",
        },
      }),
    );

    expect(assembly.assembled.sections).toEqual([
      expect.objectContaining({
        key: "health.dirty",
        status: "complete",
        confidence: "heuristic",
        provenance: [{ source: "git" }],
      }),
    ]);
    expect(assembly.assembled.provenance).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "semantic" }),
        expect.objectContaining({ source: "structural" }),
      ]),
    );
    expect(assembly.details).toMatchObject({
      confidence: "heuristic",
      candidateCount: 1,
      omittedCount: 0,
      sections: [expect.objectContaining({ key: "dirty", itemCount: 1, status: "complete" })],
      evidenceLists: [
        {
          key: "health.dirtyFiles",
          totalCount: 1,
          shownCount: 1,
          omittedCount: 0,
          partialReason: null,
        },
      ],
    });
  });

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
