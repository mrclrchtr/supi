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
      expect(surface.promptGuidelines.every((guideline) => guideline.includes(spec.name))).toBe(
        true,
      );
    }
  });

  it("builds stable prompt surfaces from shared tool specs", () => {
    expect(buildCodeIntelligenceToolPromptSurfaces()).toEqual(
      CODE_INTELLIGENCE_TOOL_PROMPT_SURFACES,
    );
  });
});
