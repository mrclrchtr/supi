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

  it("requires checking documented exceptions before alleging a rule breach", () => {
    const prompt = buildReviewerSystemPrompt();

    expect(prompt).toMatch(/documented exceptions/is);
    expect(prompt).toMatch(/why no documented exception applies/is);
  });

  it("defines test verification as source inspection, not runtime execution", () => {
    const prompt = buildReviewerSystemPrompt();

    expect(prompt).toMatch(/Test verification means inspecting test source/i);
    expect(prompt).toMatch(/runtime checks are delegated to the containing Agent/i);
  });

  it("defines criteria-only scope and criteria-source retrieval semantics", () => {
    const prompt = buildReviewerSystemPrompt();

    expect(prompt).toMatch(/criteria-only permits findings relevant to the Review Criteria/i);
    expect(prompt).toMatch(/pre-existing findings may block acceptance/i);
    expect(prompt).toMatch(/Always submit criteriaCoverage/i);
    expect(prompt).toMatch(/complete when the supplied Review Criteria were sufficient/i);
    expect(prompt).toMatch(/otherwise incomplete with the reason/i);
    expect(prompt).toMatch(/blocksAcceptance means the reviewed target/i);
    expect(prompt).not.toMatch(/blocksAcceptance means the change/i);
  });
});
