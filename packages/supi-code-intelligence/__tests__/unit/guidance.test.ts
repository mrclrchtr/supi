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
      expect(surface.description).toContain(spec.name);
      expect(surface.promptSnippet).toContain(spec.name);
      expect(surface.promptGuidelines.length).toBeGreaterThan(0);
    }
  });

  it("includes cross-family orchestration guidelines alongside base guidelines", () => {
    const surfaces = buildCodeIntelligenceToolPromptSurfaces();

    // Each tool should have at least one base guideline (mentions its own name)
    // and at least one cross-family guideline (mentions another tool family)
    for (const spec of CODE_INTELLIGENCE_TOOL_SPECS) {
      const guidelines = surfaces[spec.name].promptGuidelines;

      // At least one guideline mentions the tool's own name (base)
      const hasOwnName = guidelines.some((g) => g.includes(spec.name));
      expect(hasOwnName).toBe(true);

      // At least one guideline references another tool family (cross-family orchestration)
      const crossFamilyPatterns = ["lsp_", "tree_sitter_", "code_"];
      const hasCrossFamilyGuidance = guidelines.some((g) =>
        crossFamilyPatterns.some((pattern) => g.includes(pattern)),
      );
      expect(hasCrossFamilyGuidance).toBe(true);
    }
  });

  it("each tool includes cross-family guidance specific to its role", () => {
    const surfaces = CODE_INTELLIGENCE_TOOL_PROMPT_SURFACES;

    // code_brief should steer towards other tools for deeper dives
    const briefGuidelines = surfaces.code_brief.promptGuidelines.join(" ");
    expect(briefGuidelines).toMatch(/lsp_(hover|definition|references)/);

    // code_relations should reference lsp_* for semantic and tree_sitter_* for structural
    const relationsGlines = surfaces.code_relations.promptGuidelines.join(" ");
    expect(relationsGlines).toMatch(/lsp_(references|implementation|definition)/);

    // code_pattern should steer towards tree_sitter_query and lsp_*
    const patternGlines = surfaces.code_pattern.promptGuidelines.join(" ");
    expect(patternGlines).toMatch(/tree_sitter_query/);
    expect(patternGlines).toMatch(/lsp_/);

    // code_affected should reference lsp_references
    const affectedGlines = surfaces.code_affected.promptGuidelines.join(" ");
    expect(affectedGlines).toMatch(/lsp_references/);
  });

  it("builds stable prompt surfaces from shared tool specs", () => {
    expect(buildCodeIntelligenceToolPromptSurfaces()).toEqual(
      CODE_INTELLIGENCE_TOOL_PROMPT_SURFACES,
    );
  });
});
