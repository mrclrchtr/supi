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
    semanticAvailable: true,
    lspStatus: "ready",
    recovered: false,
    structuralAvailable: true,
    structuralStatus: "ready",
    diagnosticFileCount: 2,
    serverCount: 1,
    dirtyFileCount: null,
    coverage: null,
    unused: null,
    codeActionCount: null,
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

  it("shows an unavailable coverage locator in expanded health output", () => {
    const text = render(
      makeDetails({
        includedSections: ["coverage"],
        sections: [
          {
            key: "coverage",
            title: "Coverage",
            status: "unavailable",
            confidence: "unavailable",
            provenance: [
              {
                source: "filesystem",
                capability: "coverage-report",
                detail: "/repo/missing-coverage.json",
              },
            ],
            itemCount: 0,
            available: false,
            locator: "/repo/missing-coverage.json",
          },
        ],
        semanticAvailable: false,
        lspStatus: "unavailable — no LSP",
        structuralAvailable: false,
        structuralStatus: "unavailable — no tree-sitter",
        diagnosticFileCount: 0,
        serverCount: 0,
        dirtyFileCount: null,
        coverage: {
          available: false,
          entryCount: 0,
          reportPath: "/repo/missing-coverage.json",
        },
      }),
      true,
      "## Code Health\n\n### Coverage\n\nCoverage report unavailable at `missing-coverage.json`.",
    );

    expect(text).toContain("coverage unavailable");
    expect(text).toContain("Coverage report unavailable");
    expect(text).not.toContain("diag");
    expect(text).not.toContain("LSP:");
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

  it.each([false, true])(
    "keeps an unknown code-action remainder explicit when expanded is %s",
    (expanded) => {
      const text = render(
        makeDetails({
          evidenceLists: [
            {
              key: "health.codeActions",
              totalCount: null,
              shownCount: 0,
              omittedCount: null,
              partialReason: "safety-limit",
            },
          ],
        }),
        expanded,
        "## Code Health\n\n_(showing 0; more may exist — safety-limit)_",
      );

      expect(text).toContain("0 code actions (more may exist — safety-limit)");
      expect(text).not.toContain("0 of 0 code actions");
    },
  );
});
