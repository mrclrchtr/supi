import { describe, expect, it } from "vitest";
import { buildTsToolPromptSurfaces } from "../../src/tree-sitter/guidance.ts";
import { TS_TOOL_NAMES } from "../../src/tree-sitter/tool-specs.ts";

describe("umbrella tree-sitter guidance", () => {
  it("builds prompt surfaces for all 6 tools", () => {
    const surfaces = buildTsToolPromptSurfaces();
    expect(Object.keys(surfaces).sort()).toEqual([...TS_TOOL_NAMES].sort());

    for (const name of TS_TOOL_NAMES) {
      const surface = surfaces[name];
      expect(surface.description.length).toBeGreaterThan(0);
      expect(surface.promptSnippet).toContain(name);
      expect(surface.promptGuidelines.length).toBeGreaterThanOrEqual(1);
    }
  });
});
