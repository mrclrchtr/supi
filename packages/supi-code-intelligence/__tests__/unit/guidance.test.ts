import { describe, expect, it } from "vitest";
import {
  buildCodeIntelligenceToolPromptSurfaces,
  CODE_INTELLIGENCE_TOOL_PROMPT_SURFACES,
} from "../../src/tool/guidance.ts";
import { CODE_INTELLIGENCE_TOOL_SPECS } from "../../src/tool/tool-specs.ts";

describe("code intelligence guidance", () => {
  it("exports prompt surfaces for every focused tool", () => {
    expect(Object.keys(CODE_INTELLIGENCE_TOOL_PROMPT_SURFACES)).toEqual(
      CODE_INTELLIGENCE_TOOL_SPECS.map((spec) => spec.name),
    );

    for (const spec of CODE_INTELLIGENCE_TOOL_SPECS) {
      const surface = CODE_INTELLIGENCE_TOOL_PROMPT_SURFACES[spec.name];
      expect(surface.description.length).toBeGreaterThan(0);
      expect(surface.promptSnippet).toContain(spec.name);
      expect(surface.promptGuidelines.length).toBeGreaterThan(0);
    }
  });

  it("keeps each tool's guidance compact", () => {
    const surfaces = buildCodeIntelligenceToolPromptSurfaces();

    for (const spec of CODE_INTELLIGENCE_TOOL_SPECS) {
      const guidelines = surfaces[spec.name].promptGuidelines;
      expect(guidelines.length).toBeLessThanOrEqual(3);
      expect(guidelines.some((g) => g.includes(spec.name))).toBe(true);
    }
  });

  it("keeps cross-family routing only where it materially helps", () => {
    const surfaces = CODE_INTELLIGENCE_TOOL_PROMPT_SURFACES;

    expect(surfaces.code_brief.promptGuidelines.join(" ")).toMatch(/lsp_|tree_sitter_/);
    expect(surfaces.code_relations.promptGuidelines.join(" ")).toMatch(/lsp_|tree_sitter_/);
    expect(surfaces.code_affected.promptGuidelines.join(" ")).toMatch(/lsp_references/);
    expect(surfaces.code_pattern.promptGuidelines.join(" ")).toMatch(/tree_sitter_query|lsp_/);
    expect(surfaces.code_map.promptGuidelines.join(" ")).not.toMatch(/lsp_|tree_sitter_/);
  });

  it("builds stable prompt surfaces from shared tool specs", () => {
    expect(buildCodeIntelligenceToolPromptSurfaces()).toEqual(
      CODE_INTELLIGENCE_TOOL_PROMPT_SURFACES,
    );
  });
});
