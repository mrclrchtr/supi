import { describe, expect, it } from "vitest";
import { buildReviewerSystemPrompt } from "../src/runner.ts";

// biome-ignore lint/security/noSecrets: test description, not a real secret
describe("buildReviewerSystemPrompt", () => {
  it("includes review categories", () => {
    const prompt = buildReviewerSystemPrompt();
    expect(prompt).toContain("Review categories");
    expect(prompt).toContain("Security");
    expect(prompt).toContain("Performance");
    expect(prompt).toContain("Correctness");
    expect(prompt).toContain("Maintainability");
  });

  it("includes finding quality guidelines", () => {
    const prompt = buildReviewerSystemPrompt();
    expect(prompt).toContain("Finding quality");
    expect(prompt).toContain("priority");
    expect(prompt).toContain("confidence_score");
    expect(prompt).toContain("code_location");
  });

  it("includes tool strategy guidance", () => {
    const prompt = buildReviewerSystemPrompt();
    expect(prompt).toContain("Tool strategy");
    expect(prompt).toContain("read");
    expect(prompt).toContain("grep");
  });

  it("mentions submit_review tool", () => {
    const prompt = buildReviewerSystemPrompt();
    expect(prompt).toContain("submit_review");
  });
});
