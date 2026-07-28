import { initTheme } from "@earendil-works/pi-coding-agent";
import { beforeAll, describe, expect, it } from "vitest";
import { renderHealthResult } from "../../../src/tool/health/tui.ts";

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
        staleAssessment: { suspected: false, matchedFileCount: 0, warning: null },
      },
    });

    expect(render(details, true)).toContain("refresh completed no-op");
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
