import { initTheme } from "@earendil-works/pi-coding-agent";
import { beforeAll, describe, expect, it } from "vitest";
import { renderHealthResult } from "../../../src/tool/code_health/tui.ts";

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as never;

function makeDetails(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    includedSections: ["diagnostics", "servers"],
    sections: [
      {
        key: "diagnostics",
        title: "Diagnostics",
        status: "complete",
        confidence: "semantic",
        provenance: [{ source: "semantic", capability: "LSP" }],
        itemCount: 2,
        available: true,
      },
      {
        key: "servers",
        title: "Servers",
        status: "complete",
        confidence: "semantic",
        provenance: [{ source: "semantic", capability: "LSP" }],
        itemCount: 1,
        available: true,
      },
    ],
    semanticState: { kind: "ready" },
    serverInventoryScope: "workspace",
    diagnosticObservation: {
      kind: "completed",
      scope: { kind: "tracked-files", filter: null },
      entries: [],
      evidence: {
        requested: 0,
        confirmed: 0,
        unconfirmed: 0,
        failed: 0,
        removed: 0,
        documents: [],
      },
    },
    refresh: {
      kind: "not-requested",
      reason: "Refresh was not requested.",
      lastAttempt: null,
    },
    structuralAvailable: true,
    structuralStatus: "ready",
    capabilityWarnings: null,
    diagnosticFileCount: 2,
    serverCount: 1,
    serverRouteStatusCounts: { recovering: 0, error: 0, unavailable: 0 },
    ...overrides,
  };
}

function render(
  data: Record<string, unknown>,
  expanded = false,
  content = "## Code Health",
): string {
  const component = renderHealthResult(
    {
      content: [{ type: "text", text: content }],
      details: { type: "health", data },
    },
    { expanded, isPartial: false },
    theme,
    undefined,
  );
  return component.render(120).join("\n");
}

beforeAll(() => initTheme("dark"));

describe("code_health TUI projection", () => {
  it("renders refresh status from structured health details", () => {
    const details = makeDetails({
      refresh: {
        kind: "completed",
        attemptedAt: 1,
        requestedDiagnosticScope: { kind: "tracked-files", filter: null },
        operationScope: "workspace-runtime",
        attemptedActiveClients: 0,
        restartedClients: 0,
        diagnosticEvidence: {
          requested: 0,
          confirmed: 0,
          unconfirmed: 0,
          failed: 0,
          removed: 0,
          documents: [],
        },
        staleAssessment: {
          scope: "workspace",
          suspected: false,
          matchedFileCount: 0,
          warning: null,
        },
      },
    });

    expect(render(details, true)).toContain("refresh attempt completed no-op");
  });

  it("renders diagnostic coverage in the compact view", () => {
    expect(render(makeDetails())).toContain("req 0 · conf 0 · unconf 0 · failed 0 · removed 0");
  });

  it("renders typed workspace route counts without changing ready state", () => {
    const details = makeDetails({
      serverRouteStatusCounts: { recovering: 1, error: 2, unavailable: 1 },
    });

    const compact = render(details);
    expect(compact).toContain("lsp ready workspace routes: 1 recovering");
    expect(compact).toContain("errors, 1 unavailable");
    const expanded = render(details, true);
    expect(expanded).toContain("LSP: ready — workspace routes: 1 recovering");
    expect(expanded).toContain("errors, 1 unavailable");
  });

  it("renders exact partial diagnostic coverage in the expanded view", () => {
    const details = makeDetails({
      sections: [
        {
          key: "diagnostics",
          title: "Diagnostics",
          status: "partial",
          confidence: "semantic",
          provenance: [{ source: "semantic", capability: "LSP" }],
          itemCount: 0,
          available: true,
        },
      ],
      diagnosticObservation: {
        kind: "partial",
        scope: { kind: "tracked-files", filter: null },
        entries: [],
        evidence: {
          requested: 3,
          confirmed: 1,
          unconfirmed: 1,
          failed: 1,
          removed: 0,
          documents: [
            { file: "src/a.ts", status: "confirmed" },
            { file: "src/b.ts", status: "unconfirmed" },
            { file: "src/c.ts", status: "failed" },
          ],
        },
        reason: "Diagnostic evidence is partial.",
      },
    });

    expect(render(details, true)).toContain(
      "Tracked-file diagnostics partial (3 requested, 1 confirmed, 1 unconfirmed, 1 failed, 0 removed)",
    );
  });

  it("renders the previous refresh attempt in the compact view", () => {
    const details = makeDetails({
      refresh: {
        kind: "not-requested",
        reason: "Refresh was not requested.",
        lastAttempt: {
          kind: "failed",
          reason: "server stopped",
          diagnosticEvidence: {
            requested: 2,
            confirmed: 0,
            unconfirmed: 1,
            failed: 1,
            removed: 0,
          },
        },
      },
    });

    expect(render(details)).toContain("last refresh attempt failed");
    expect(render(details)).toMatch(
      /req 2\s*·\s*conf 0\s*·\s*unconf 1\s*·\s*failed 1\s*·\s*removed 0/,
    );
  });

  it("renders Capability Warnings from structured health details", () => {
    const details = makeDetails({
      capabilityWarnings: {
        hasWarnings: true,
        warnings: [
          {
            type: "missing-server",
            language: "python",
            message: "pyright-langserver not found on PATH",
          },
        ],
      },
    });

    expect(render(details)).toContain("1 capability warning");
    const expanded = render(details, true);
    expect(expanded).toContain("Capability Warnings");
    expect(expanded).toContain("pyright-langserver not found on PATH");
  });
});
