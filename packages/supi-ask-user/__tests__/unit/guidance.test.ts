import { describe, expect, it } from "vitest";
import { askUserPromptGuidelines, askUserPromptSnippet } from "../../src/ask-user.ts";
import { AskUserParamsSchema } from "../../src/schema.ts";

describe("ask_user guidance", () => {
  it("mentions ask_user in its prompt surfaces", () => {
    expect(askUserPromptSnippet).toContain("ask_user");
    expect(askUserPromptGuidelines.every((guideline) => guideline.includes("ask_user"))).toBe(true);
  });

  it("keeps guidance and top-level schema copy compact", () => {
    expect(askUserPromptGuidelines.length).toBeLessThanOrEqual(4);

    const props = AskUserParamsSchema.properties as Record<string, { description?: string }>;
    expect(props.questions.description?.length ?? 0).toBeLessThanOrEqual(45);
    expect(props.allowPartialSubmit.description?.length ?? 0).toBeLessThanOrEqual(45);
    expect(props.allowDiscuss.description?.length ?? 0).toBeLessThanOrEqual(45);
  });
});
