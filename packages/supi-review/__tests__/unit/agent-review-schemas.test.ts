import { describe, expect, it } from "vitest";
import { parseRunReviewToolInput, runReviewSchema } from "../../src/tool/agent-review-schemas.ts";

const commit = "a".repeat(40);
const review = { tasks: [{ id: "spec", instructions: "Check the spec." }] };

describe("agent review schemas", () => {
  it("advertises an object-rooted provider-compatible run schema", () => {
    expect(runReviewSchema.type).toBe("object");
    expect(runReviewSchema.properties).toHaveProperty("mode");
    expect(JSON.stringify(runReviewSchema)).not.toContain('"anyOf"');
    expect(JSON.stringify(runReviewSchema)).not.toContain('"const"');
  });

  it("narrows valid Direct and Prepared requests", () => {
    expect(
      parseRunReviewToolInput({
        mode: "direct",
        target: { kind: "comparison", baseCommit: commit },
        review,
      }),
    ).toEqual({
      mode: "direct",
      target: { kind: "comparison", baseCommit: commit },
      review,
    });
    expect(
      parseRunReviewToolInput({
        mode: "prepared",
        planId: "plan-1",
        decision: { kind: "accept-draft" },
      }),
    ).toEqual({
      mode: "prepared",
      planId: "plan-1",
      decision: { kind: "accept-draft" },
    });
  });

  it.each([
    { mode: "direct", review },
    { mode: "direct", target: { kind: "working-tree" }, review, planId: "mixed" },
    { mode: "prepared", planId: "plan-1" },
    {
      mode: "prepared",
      planId: "plan-1",
      decision: { kind: "accept-draft", review },
    },
    {
      mode: "direct",
      target: { kind: "comparison", commit },
      review,
    },
  ])("rejects mismatched mode fields", (input) => {
    expect(() => parseRunReviewToolInput(input)).toThrow();
  });

  it("rejects the removed per-run local replay request", () => {
    expect(() =>
      parseRunReviewToolInput({
        mode: "direct",
        target: { kind: "working-tree" },
        review,
        audit: "local-replay",
      }),
    ).toThrow();
  });

  it("accepts a base-aware working-tree target for committed plus uncommitted work", () => {
    expect(
      parseRunReviewToolInput({
        mode: "direct",
        target: { kind: "working-tree", baseCommit: "9510d68" },
        review,
      }),
    ).toEqual({
      mode: "direct",
      target: { kind: "working-tree", baseCommit: "9510d68" },
      review,
    });
  });

  it("accepts short commit hashes (7+ hex chars)", () => {
    expect(
      parseRunReviewToolInput({
        mode: "direct",
        target: { kind: "commit", commit: "9510d68" },
        review,
      }),
    ).toEqual({
      mode: "direct",
      target: { kind: "commit", commit: "9510d68" },
      review,
    });

    // 40-char hashes still work
    expect(
      parseRunReviewToolInput({
        mode: "direct",
        target: { kind: "comparison", baseCommit: commit },
        review,
      }),
    ).toBeDefined();
  });

  it("is lenient about extraneous fields on the target", () => {
    // Comparison with both baseCommit and commit — should ignore commit
    expect(
      parseRunReviewToolInput({
        mode: "direct",
        target: { kind: "comparison", baseCommit: commit, commit },
        review,
      }),
    ).toEqual({
      mode: "direct",
      target: { kind: "comparison", baseCommit: commit },
      review,
    });

    // Commit with both baseCommit and commit — should ignore baseCommit
    expect(
      parseRunReviewToolInput({
        mode: "direct",
        target: { kind: "commit", commit, baseCommit: commit },
        review,
      }),
    ).toEqual({
      mode: "direct",
      target: { kind: "commit", commit },
      review,
    });
  });
});
