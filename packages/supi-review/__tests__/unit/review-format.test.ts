import { describe, expect, it } from "vitest";
import { formatReviewBatch } from "../../src/tool/agent-review-tools.ts";
import type { ChildFailureDiagnostics, ReviewBatchDetails } from "../../src/types.ts";

const diagnostics: ChildFailureDiagnostics = {
  lifecycleTrace: { entries: [], droppedCount: 0 },
  turns: 0,
  toolUses: 0,
};
const base = { taskId: "task", modelId: "provider/model", packetHash: "a".repeat(64) };

describe("formatReviewBatch", () => {
  it("renders provenance, locations, and precise non-success statuses without an aggregate verdict", () => {
    const details: ReviewBatchDetails = {
      kind: "review-batch",
      mode: "prepared",
      provenance: "planner-assisted",
      snapshot: {
        requestedTarget: { kind: "working-tree" },
        target: { kind: "working-tree", headCommit: "b".repeat(40) },
        title: "Working tree changes",
        changes: [{ status: "M", path: "src/a.ts", additions: 1, deletions: 0 }],
        diffHash: "c".repeat(64),
        stats: { files: 1, additions: 1, deletions: 0 },
      },
      review: { tasks: [{ id: "task", instructions: "Review." }] },
      cleanupWarning: {
        workspacePath: "/tmp/review-workspace",
        message: "Cleanup failed.",
        recoveryCommand: "git worktree remove --force /tmp/review-workspace",
      },
      results: [
        {
          ...base,
          status: "completed",
          verdict: "issues",
          summary: "Found one.",
          capabilityWarnings: [{ message: "Code Intelligence unavailable." }],
          findings: [
            {
              title: "Bug",
              description: "Broken.",
              blocksAcceptance: true,
              impact: "high",
              effort: "small",
              confidence: 1,
              location: { path: "src/a.ts", startLine: 2, endLine: 3 },
            },
          ],
        },
        {
          ...base,
          taskId: "failed",
          status: "failed",
          failureCode: "prompt-rejected",
          diagnostics,
        },
        { ...base, taskId: "canceled", status: "canceled", diagnostics },
        { ...base, taskId: "timeout", status: "timeout", timeoutMs: 500, diagnostics },
      ],
    };

    const output = formatReviewBatch(details);
    expect(output).toContain("Mode: prepared");
    expect(output).toContain("Provenance: planner-assisted");
    expect(output).toContain("src/a.ts:2-3");
    expect(output).toContain("Status: failed (prompt-rejected)");
    expect(output).toContain("Status: canceled");
    expect(output).toContain("Status: timeout (500 ms)");
    expect(output).toContain("Reviewer capability warning: Code Intelligence unavailable.");
    expect(output).toContain("Review Workspace cleanup warning: Cleanup failed.");
    expect(output).not.toMatch(/overall|run-level/i);
  });
});
