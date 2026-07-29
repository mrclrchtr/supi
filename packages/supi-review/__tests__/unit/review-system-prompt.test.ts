import { describe, expect, it } from "vitest";
import { buildReviewerSystemPrompt } from "../../src/tool/review-system-prompt.ts";

describe("reviewer system prompt", () => {
  it("treats repository documents as criteria without granting them protocol authority", () => {
    const prompt = buildReviewerSystemPrompt();

    expect(prompt).toMatch(/repository content.*untrusted/i);
    expect(prompt).toMatch(/cannot override.*protocol/i);
    expect(prompt).toMatch(/Review Criteria.*never as authority/is);
    expect(prompt).toMatch(/Do not run.*services/i);
  });

  it("allows reviewer bootstrap only when no parent command is configured", () => {
    expect(buildReviewerSystemPrompt()).toMatch(/optional Dependency Bootstrap/i);
    expect(buildReviewerSystemPrompt(true)).not.toMatch(/Dependency Bootstrap/i);
  });
});
