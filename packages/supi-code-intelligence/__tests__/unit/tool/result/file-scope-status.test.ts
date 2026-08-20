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

describe("code_health file-scope status line", () => {
  function fileScopeData(
    scopeStatus: NonNullable<
      Extract<HealthData["diagnostics"], { kind: "completed" }>["scopeStatus"]
    >,
  ): HealthData {
    return makeHealthData({
      diagnostics: {
        kind: "completed",
        scope: { kind: "file", path: "/repo/src/late.ts" },
        entries: [],
        evidence: fileEvidence("confirmed"),
        scopeStatus,
      },
    });
  }

  it("renders an included file with its basis and config path", () => {
    const assembly = assembleHealthResult(
      fileScopeData({
        status: "included",
        basis: "include-pattern",
        configPath: "/repo/packages/app/tsconfig.json",
        caseSensitiveFileNames: false,
      }),
    );
    const markdown = renderHealthResult(assembly, "/repo");

    expect(markdown).toContain(
      "**Tsconfig**: covered by `packages/app/tsconfig.json` — part of workspace diagnostics.",
    );
  });

  it("renders an excluded file with the consequence spelled out", () => {
    const assembly = assembleHealthResult(
      fileScopeData({
        status: "excluded",
        basis: "exclude-pattern",
        configPath: "/repo/packages/app/tsconfig.json",
        caseSensitiveFileNames: false,
      }),
    );
    const markdown = renderHealthResult(assembly, "/repo");

    expect(markdown).toContain(
      "**Tsconfig**: NOT covered by `packages/app/tsconfig.json` — not part of workspace diagnostics.",
    );
  });

  it("renders the no-config case without a config path", () => {
    const assembly = assembleHealthResult(
      fileScopeData({
        status: "no-config",
        basis: null,
        configPath: null,
        caseSensitiveFileNames: false,
      }),
    );
    const markdown = renderHealthResult(assembly, "/repo");

    expect(markdown).toContain(
      "**Tsconfig**: no tsconfig.json or jsconfig.json found — nothing filtered.",
    );
  });

  it("omits the line for workspace-scope observations", () => {
    const assembly = assembleHealthResult(
      makeHealthData({
        diagnostics: {
          kind: "completed",
          scope: { kind: "tracked-files", filter: null },
          entries: [],
          evidence: cleanEvidence(),
        },
      }),
    );
    const markdown = renderHealthResult(assembly, "/repo");

    expect(markdown).not.toContain("**Tsconfig**:");
  });
});
