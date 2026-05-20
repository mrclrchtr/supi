import { describe, expect, it } from "vitest";
import { promptGuidelines, promptSnippet, toolDescription } from "../src/tool/guidance.ts";

describe("tree_sitter guidance", () => {
  it("exports non-empty prompt surfaces", () => {
    expect(toolDescription).toContain("Tree-sitter tool");
    expect(promptSnippet).toContain("tree_sitter");
    expect(promptGuidelines.length).toBe(6);
    expect(promptGuidelines[0]).toContain("tree_sitter.outline");
    expect(promptGuidelines.every((guideline) => guideline.includes("tree_sitter"))).toBe(true);
  });
});
