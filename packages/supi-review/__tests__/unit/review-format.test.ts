import { describe, expect, it } from "vitest";
import { formatReviewBatch } from "../../src/tool/agent-review-tools.ts";
import type { ReviewBatchDetails } from "../../src/types.ts";

const details: ReviewBatchDetails = {
  kind: "review-batch",
  provenance: "caller-supplied",
  snapshot: {
    requestedTarget: {},
    target: {
      fromCommit: "a".repeat(40),
      toCommit: "a".repeat(40),
      includeUncommittedChanges: true,
    },
    title: "Filesystem changes",
    changes: [{ status: "M", path: "src/a.ts", additions: 1, deletions: 0 }],
    diffHash: "b".repeat(64),
    stats: { files: 1, additions: 1, deletions: 0 },
  },
  review: { tasks: [{ id: "task", instructions: "Review.", mode: "change" }] },
  workspaceReceipt: {
    status: "verified",
    fromCommit: "a".repeat(40),
    toCommit: "a".repeat(40),
    includeUncommittedChanges: true,
    expectedWorkspaceHead: "a".repeat(40),
    observedWorkspaceHead: "a".repeat(40),
    expectedDiffHash: "b".repeat(64),
    observedDiffHash: "b".repeat(64),
    changedPathCount: 1,
  },
  results: [
    {
      status: "completed",
      taskId: "task",
      mode: "change",
      modelId: "provider/model",
      packetHash: "c".repeat(64),
      verdict: "issues",
      findingCounts: {
        total: 1,
        blocking: 1,
        nonBlocking: 0,
        byImpact: { low: 0, medium: 0, high: 1 },
      },
      summary: "Found one.",
      criteriaCoverage: { status: "complete" },
      findings: [
        {
          title: "Bug",
          description: "Broken.",
          blocksAcceptance: true,
          impact: "high",
          effort: "small",
          confidence: 1,
        },
      ],
    },
  ],
};

describe("formatReviewBatch", () => {
  it("renders resolved target facts, Review Mode, and independent task verdicts", () => {
    const output = formatReviewBatch(details);

    expect(output).toContain("from aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(output).toContain("to aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(output).toContain("uncommitted changes included");
    expect(output).toContain("Focus: repository-wide review");
    expect(output).toContain("Review Mode: change");
    expect(output).toContain("Verdict: ISSUES");
    expect(output).not.toContain("Finding Scope");
    expect(output).not.toContain("Packet SHA-256:");
    expect(output).not.toContain("Model: provider/model");
    expect(output).not.toContain("Usage:");

    const scopedOutput = formatReviewBatch({
      ...details,
      scope: { paths: ["src/a.ts", "docs/review guide.md"] },
    });
    expect(scopedOutput).toContain('Focus: path focus\n- "src/a.ts"\n- "docs/review guide.md"');
    expect(scopedOutput).not.toContain('"src/a.ts", "docs/review guide.md"');
  });

  it("uses an after-state title for an all-state filesystem Review", () => {
    const output = formatReviewBatch({
      ...details,
      snapshot: { ...details.snapshot, title: "Current filesystem" },
      review: { tasks: [{ id: "state", instructions: "Review.", mode: "state" }] },
      results: [{ ...details.results[0], taskId: "state", mode: "state" }],
    });

    expect(output).toContain("Target: Current filesystem");
    expect(output).not.toContain("Target: Filesystem changes");
  });
});
