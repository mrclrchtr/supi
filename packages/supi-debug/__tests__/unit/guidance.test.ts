import { describe, expect, it } from "vitest";
import { promptGuidelines, promptSnippet, toolDescription } from "../../src/tool/guidance.ts";

describe("supi_debug guidance", () => {
  it("exports non-empty prompt surfaces", () => {
    expect(toolDescription).toContain("debug events");
    expect(promptSnippet).toContain("SuPi extension debug events");
    expect(promptGuidelines.length).toBe(2);
    expect(promptGuidelines[0]).toContain("supi_debug");
  });
});
