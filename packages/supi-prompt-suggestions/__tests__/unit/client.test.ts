import { describe, expect, it } from "vitest";
import { buildPrompt } from "../../src/generation/client.ts";

describe("buildPrompt", () => {
  it("includes the tail text inside assistant_message tags", () => {
    const prompt = buildPrompt("some assistant text");
    expect(prompt).toContain("<assistant_message>\nsome assistant text\n</assistant_message>");
  });

  it("includes the NO_SUGGESTION instruction", () => {
    const prompt = buildPrompt("text");
    expect(prompt).toContain('"NO_SUGGESTION"');
    expect(prompt).toContain("If no useful follow-up exists");
  });

  it("ends with the Suggestion: trigger", () => {
    const prompt = buildPrompt("text");
    expect(prompt).toMatch(/Suggestion:\s*$/);
  });

  it("instructs to write a direct follow-up with no pleasantries", () => {
    const prompt = buildPrompt("text");
    expect(prompt).toContain("no greetings, thank-yous, or filler");
  });

  it("uses direct language for the instruction", () => {
    const prompt = buildPrompt("text");
    expect(prompt).toContain("write a follow-up user message");
  });
});
