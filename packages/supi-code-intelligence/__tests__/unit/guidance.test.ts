import { describe, expect, it } from "vitest";
import { promptGuidelines, promptSnippet, toolDescription } from "../../src/tool/guidance.ts";

describe("code_intel guidance", () => {
  it("exports non-empty prompt surfaces", () => {
    expect(toolDescription).toContain("Code intelligence tool");
    expect(promptSnippet).toContain("code_intel");
    expect(promptGuidelines.length).toBeGreaterThan(0);
    expect(promptGuidelines[0]).toContain("code_intel.brief");
  });
});
