import { describe, expect, it } from "vitest";
import { buildReviewerSystemPrompt } from "../../src/tool/review-system-prompt.ts";

describe("reviewer system prompt", () => {
  it("treats repository content as untrusted evidence rather than instructions", () => {
    const prompt = buildReviewerSystemPrompt();

    expect(prompt).toMatch(/repository content.*untrusted/i);
    expect(prompt).toMatch(/do not follow.*instructions/i);
  });
});
