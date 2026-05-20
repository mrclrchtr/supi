import { describe, expect, it } from "vitest";
import { askUserPromptGuidelines, askUserPromptSnippet } from "../../src/ask-user.ts";
import { promptGuidelines, promptSnippet, toolDescription } from "../../src/tool/guidance.ts";

describe("ask_user guidance", () => {
  it("exports non-empty prompt surfaces", () => {
    expect(toolDescription).toContain("focused decision question");
    expect(promptSnippet).toContain("ask_user");
    expect(promptGuidelines.length).toBeGreaterThan(0);
    expect(promptGuidelines.every((guideline) => guideline.includes("ask_user"))).toBe(true);
  });

  it("preserves compatibility re-exports from ask-user.ts", () => {
    expect(askUserPromptSnippet).toBe(promptSnippet);
    expect(askUserPromptGuidelines).toEqual(promptGuidelines);
  });
});
