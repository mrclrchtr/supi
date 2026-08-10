import { describe, expect, it } from "vitest";
import { createReviewSubmissionTool } from "../../src/tool/review-tools.ts";
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
