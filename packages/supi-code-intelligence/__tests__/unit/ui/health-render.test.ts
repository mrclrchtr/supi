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
    recovered: false,
    structuralAvailable: true,
    structuralStatus: "ready",
    capabilityWarnings: null,
    diagnosticFileCount: 2,
    serverCount: 1,
    dirtyFileCount: null,
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
  it("summarizes only the requested dirty signal", () => {
    const text = render(
      makeDetails({
        includedSections: ["dirty"],
        sections: [
          {
            key: "dirty",
            title: "Dirty",
            status: "complete",
            confidence: "heuristic",
            provenance: [{ source: "git" }],
            itemCount: 3,
            available: true,
          },
        ],
        dirtyFileCount: 3,
      }),
    );

    expect(text).toContain("dirty 3");
    expect(text).not.toContain("diag");
    expect(text).not.toContain("servers");
    expect(text).not.toContain("lsp");
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

  it.each([false, true])("projects bounded dirty-file evidence when expanded is %s", (expanded) => {
    const text = render(
      makeDetails({
        includedSections: ["dirty"],
        sections: [
          {
            key: "dirty",
            title: "Dirty",
            status: "complete",
            confidence: "heuristic",
            provenance: [{ source: "git" }],
            itemCount: 6,
            available: true,
          },
        ],
        evidenceLists: [
          {
            key: "health.dirtyFiles",
            totalCount: 6,
            shownCount: 5,
            omittedCount: 1,
            partialReason: null,
          },
        ],
      }),
      expanded,
      "## Code Health\n\n_(showing 5 of 6; 1 omitted)_",
    );

    expect(text).toContain("5 of 6 dirty files (1 omitted)");
  });
});
