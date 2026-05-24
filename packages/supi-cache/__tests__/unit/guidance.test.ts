import { describe, expect, it } from "vitest";
import { promptGuidelines, promptSnippet, toolDescription } from "../../src/tool/guidance.ts";

describe("supi_cache_forensics guidance", () => {
  it("exports non-empty prompt surfaces", () => {
    expect(toolDescription).toContain("prompt cache regressions");
    expect(promptSnippet).toContain("supi_cache_forensics");
    expect(promptGuidelines.length).toBeLessThanOrEqual(4);
    expect(promptGuidelines.every((guideline) => guideline.includes("supi_cache_forensics"))).toBe(
      true,
    );
  });
});
