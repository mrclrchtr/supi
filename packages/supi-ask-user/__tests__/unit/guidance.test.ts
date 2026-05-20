import { describe, expect, it } from "vitest";
import { askUserPromptGuidelines, askUserPromptSnippet } from "../../src/ask-user.ts";
import { promptGuidelines, promptSnippet, toolDescription } from "../../src/tool/guidance.ts";

describe("ask_user guidance", () => {
  it("exports non-empty prompt surfaces", () => {
    expect(toolDescription).toContain("focused decision question");
    expect(promptSnippet).toContain("ask_user");
    expect(promptGuidelines.length).toBeGreaterThan(0);
    expect(promptGuidelines[0]).toContain("ask_user");
  });

  it("preserves compatibility re-exports from ask-user.ts", () => {
    expect(askUserPromptSnippet).toBe(promptSnippet);
    expect(askUserPromptGuidelines).toEqual(promptGuidelines);
  });
});
