import { describe, expect, it } from "vitest";
import {
  createReviewRecoveryDeclineTool,
  createReviewSubmissionTool,
} from "../../src/tool/review-tools.ts";
import type { ReviewSubmission } from "../../src/types.ts";

describe("submit_review", () => {
  it("validates direct-call arguments before normalization", async () => {
    const submission: { value?: ReviewSubmission } = {};
    const tool = createReviewSubmissionTool(submission);

    await expect(
      tool.execute(
        "call",
        {
          summary: "Invalid.",
          findings: [
            {
              title: "Finding",
              description: "Evidence.",
              blocksAcceptance: true,
              impact: "critical",
              effort: "small",
              confidence: 1,
            },
          ],
          criteriaCoverage: { status: "complete" },
        } as never,
        undefined,
        undefined,
        {} as never,
      ),
    ).rejects.toThrow("Invalid review submission");
    expect(submission.value).toBeUndefined();
  });
});

describe("decline_review_recovery", () => {
  it("rejects conflicting recovery terminal choices", async () => {
    const submission: { value?: ReviewSubmission } = {};
    const terminal: {
      choice?: "submitted" | "declined" | "conflict";
      reason?: string;
    } = {};
    const submit = createReviewSubmissionTool(submission, terminal);
    const decline = createReviewRecoveryDeclineTool(terminal);
    const args = {
      summary: "Done.",
      findings: [],
      criteriaCoverage: { status: "complete" as const },
    };

    await submit.execute("submit", args, undefined, undefined, {} as never);
    await expect(
      decline.execute("decline", { reason: "cannot recover" }, undefined, undefined, {} as never),
    ).rejects.toThrow("already has a terminal choice");
    expect(terminal.choice).toBe("conflict");
  });

  it("requires one non-empty bounded reason", async () => {
    const holder: { reason?: string } = {};
    const tool = createReviewRecoveryDeclineTool(holder);

    await expect(
      tool.execute("call", { reason: "   " }, undefined, undefined, {} as never),
    ).rejects.toThrow("must contain visible text");
    await expect(
      tool.execute("call", { reason: "\u0000" }, undefined, undefined, {} as never),
    ).rejects.toThrow("must contain visible text");
    await expect(
      tool.execute("call", { reason: "x".repeat(2_001) }, undefined, undefined, {} as never),
    ).rejects.toThrow("Invalid recovery decline");
    await expect(
      tool.execute(
        "call",
        { reason: "retained history is insufficient" },
        undefined,
        undefined,
        {} as never,
      ),
    ).resolves.toMatchObject({ terminate: true });
    expect(holder.reason).toBe("retained history is insufficient");
  });
});
