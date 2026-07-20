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
    codeActions: null,
    coverage: null,
    unused: null,
    ...overrides,
  };
}

describe("code_health result assembly", () => {
  it("assembles only requested sections with evidence-backed provenance", () => {
    const assembly = assembleHealthResult(
      makeHealthData({
        includedSections: ["dirty", "coverage"],
        semanticState: null,
        gitContext: {
          branch: "main",
          dirtyFiles: ["src/index.ts"],
          lastCommitMessage: "initial",
        },
        coverage: {
          reportPath: "/repo/coverage.json",
          available: true,
          entries: [{ file: "/repo/src/index.ts", pct: 20 }],
        },
      }),
    );

    expect(assembly.assembled.sections.map((section) => section.key)).toEqual([
      "health.dirty",
      "health.coverage",
    ]);
    expect(assembly.assembled.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "health.dirty",
          status: "complete",
          confidence: "heuristic",
          provenance: [{ source: "git" }],
        }),
        expect.objectContaining({
          key: "health.coverage",
          status: "complete",
          confidence: "heuristic",
          provenance: [
            {
              source: "filesystem",
              capability: "coverage-report",
              detail: "/repo/coverage.json",
            },
          ],
        }),
      ]),
    );
    expect(assembly.assembled.provenance).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "semantic" }),
        expect.objectContaining({ source: "structural" }),
      ]),
    );
    expect(assembly.details.provenance).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "semantic" }),
        expect.objectContaining({ source: "structural" }),
      ]),
    );
    expect(assembly.details).toMatchObject({
      confidence: "heuristic",
      candidateCount: 2,
      omittedCount: 0,
      sections: expect.arrayContaining([
        expect.objectContaining({ key: "dirty", itemCount: 1, status: "complete" }),
        expect.objectContaining({ key: "coverage", itemCount: 1, status: "complete" }),
      ]),
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

  it("keeps a missing report as an unavailable locator check", () => {
    const data = makeHealthData({
      includedSections: ["diagnostics", "coverage", "unused"],
      semanticState: { kind: "unavailable", reason: "No LSP" },
      coverage: {
        reportPath: "/repo/missing-coverage.json",
        available: false,
        entries: [],
      },
      unused: {
        reportPath: "/repo/missing-knip.json",
        available: false,
        files: [],
        exports: [],
      },
    });
    const assembly = assembleHealthResult(data);
    const markdown = renderHealthResult(assembly, "/repo");

    expect(assembly.assembled.sections.map((section) => section.key)).toEqual([
      "health.diagnostics",
      "health.coverage",
      "health.unused",
    ]);
    expect(assembly.details.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "coverage",
          status: "unavailable",
          available: false,
          locator: "/repo/missing-coverage.json",
        }),
        expect.objectContaining({
          key: "unused",
          status: "unavailable",
          available: false,
          locator: "/repo/missing-knip.json",
        }),
      ]),
    );
    expect(markdown).toContain("Diagnostics unavailable");
    expect(markdown).not.toContain("No diagnostics found.");
    expect(markdown).toContain(
      "Coverage report unavailable at `missing-coverage.json`; this locator does not establish that no coverage report exists elsewhere.",
    );
    expect(markdown).toContain(
      "Unused-code report unavailable at `missing-knip.json`; this locator does not establish that no unused-code report exists elsewhere.",
    );
  });

  it("does not expose code-action evidence outside a requested detailed diagnostics collection", () => {
    const codeActions = {
      items: [{ file: "/repo/src/index.ts", line: 1, title: "Fix it" }],
      evidence: {
        key: "health.codeActions",
        totalCount: 1,
        shownCount: 1,
        omittedCount: 0,
        partialReason: null,
      },
    };
    const serverAssembly = assembleHealthResult(
      makeHealthData({ includedSections: ["servers"], level: "detailed", codeActions }),
    );
    const summaryAssembly = assembleHealthResult(
      makeHealthData({ includedSections: ["diagnostics"], codeActions }),
    );

    expect(serverAssembly.assembled.evidenceLists).toEqual([]);
    expect(summaryAssembly.assembled.evidenceLists).toEqual([]);
    expect(renderHealthResult(summaryAssembly, "/repo")).not.toContain("Fix it");
  });
});
