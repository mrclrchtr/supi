import { describe, expect, it } from "vitest";
import { buildPrompt } from "../../src/generation/client.ts";

describe("buildPrompt", () => {
  it("includes the tail text inside assistant_message tags", () => {
    const prompt = buildPrompt("some assistant text");
    expect(prompt).toContain("<assistant_message>\nsome assistant text\n</assistant_message>");
  });

  it("ends with the Suggestion: trigger", () => {
    const prompt = buildPrompt("text");
    expect(prompt).toMatch(/Suggestion:\s*$/);
  });

  it("formats the assistant message only, no inline instructions", () => {
    const prompt = buildPrompt("do X");
    expect(prompt).toBe("<assistant_message>\ndo X\n</assistant_message>\n\nSuggestion:");
  });
});
