import { describe, expect, it } from "vitest";
import { askUserPromptGuidelines, askUserPromptSnippet } from "../../src/ask-user.ts";

describe("ask_user guidance", () => {
  it("mentions ask_user in its prompt surfaces", () => {
    expect(askUserPromptSnippet).toContain("ask_user");
    expect(askUserPromptGuidelines.every((guideline) => guideline.includes("ask_user"))).toBe(true);
  });
});
