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
      workspaceReceipt: {
        status: "verified",
        targetKind: "working-tree",
        baselineRevision: "b".repeat(40),
        expectedWorkspaceHead: "b".repeat(40),
        observedWorkspaceHead: "b".repeat(40),
        expectedDiffHash: "c".repeat(64),
        observedDiffHash: "c".repeat(64),
        changedPathCount: 1,
      },
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
          findingCounts: {
            total: 1,
            blocking: 1,
            nonBlocking: 0,
            byImpact: { low: 0, medium: 0, high: 1 },
          },
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
          taskId: "advisory",
          status: "completed",
          verdict: "pass_with_findings",
          findingCounts: {
            total: 1,
            blocking: 0,
            nonBlocking: 1,
            byImpact: { low: 1, medium: 0, high: 0 },
          },
          summary: "One advisory.",
          findings: [
            {
              title: "Advisory",
              description: "Worth considering.",
              blocksAcceptance: false,
              impact: "low",
              effort: "small",
              confidence: 1,
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
    expect(output).toContain("Verdict: ISSUES");
    expect(output).toContain(
      "Findings: 1 total · 1 blocking · 0 non-blocking · impact: 1 high, 0 medium, 0 low",
    );
    expect(output).toContain("Verdict: PASS_WITH_FINDINGS");
    expect(output).toContain(
      "Findings: 1 total · 0 blocking · 1 non-blocking · impact: 0 high, 0 medium, 1 low",
    );
    expect(output).toContain("src/a.ts:2-3");
    expect(output).toContain("Status: failed (prompt-rejected)");
    expect(output).toContain("Status: canceled");
    expect(output).toContain("Status: timeout (500 ms)");
    expect(output).toContain("Reviewer capability warning: Code Intelligence unavailable.");
    expect(output).toContain("Review Workspace cleanup warning: Cleanup failed.");
    expect(output).not.toMatch(/overall|run-level/i);
  });
});
