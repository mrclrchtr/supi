import { describe, expect, it } from "vitest";
import { buildLspToolPromptSurfaces } from "../../src/lsp/guidance.ts";
import { LSP_TOOL_DEFINITION_SPECS } from "../../src/lsp/tool-specs.ts";

describe("umbrella LSP guidance", () => {
  it("builds prompt surfaces for every LSP tool", () => {
    const surfaces = buildLspToolPromptSurfaces([], "/tmp");

    for (const spec of LSP_TOOL_DEFINITION_SPECS) {
      const surface = surfaces[spec.name];
      expect(surface.description.length).toBeGreaterThan(0);
      expect(surface.promptSnippet).toContain(spec.name);
      expect(surface.promptGuidelines.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("attaches dynamic server coverage lines to lsp_hover only", () => {
    const surfaces = buildLspToolPromptSurfaces(
      [
        {
          name: "typescript",
          status: "running",
          root: "/tmp/project",
          fileTypes: ["ts", "tsx"],
          supportedActions: ["hover", "definition"],
          openFiles: [],
        },
      ],
      "/tmp/project",
    );

    const hoverGuidelines = surfaces.lsp_hover.promptGuidelines;
    expect(hoverGuidelines.some((g) => g.startsWith("lsp server coverage:"))).toBe(true);

    // Check a non-hover tool doesn't get coverage guidelines
    const defGuidelines = surfaces.lsp_definition.promptGuidelines;
    expect(defGuidelines.some((g) => g.startsWith("lsp server coverage:"))).toBe(false);
  });

  it("includes unavailable server hints", () => {
    const surfaces = buildLspToolPromptSurfaces(
      [
        {
          name: "python",
          status: "unavailable",
          root: "/tmp",
          fileTypes: ["py"],
          supportedActions: [],
          openFiles: [],
        },
      ],
      "/tmp",
    );

    const guidelines = surfaces.lsp_hover.promptGuidelines;
    expect(guidelines.some((g) => g.includes("lsp server unavailable"))).toBe(true);
  });
});
