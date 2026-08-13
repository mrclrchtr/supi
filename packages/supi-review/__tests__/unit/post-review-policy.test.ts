import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import {
  buildPostReviewInstruction,
  queuePostReviewTurn,
} from "../../src/tool/post-review-policy.ts";
import type { ReviewBatchDetails, ReviewOutputReference } from "../../src/types.ts";

const output: ReviewOutputReference = {
  artifactId: "review-output-test",
  offset: 0,
  nextOffset: 100,
  totalCharacters: 200,
};

function makeDetails(options: { findings?: boolean; partial?: boolean } = {}): ReviewBatchDetails {
  const hasFindings = options.findings ?? true;
  const results: ReviewBatchDetails["results"] = [
    {
      status: "completed",
      taskId: "spec",
      mode: "change",
      modelId: "provider/model",
      packetHash: "c".repeat(64),
      verdict: hasFindings ? "issues" : "pass",
      findingCounts: {
        total: hasFindings ? 1 : 0,
        blocking: hasFindings ? 1 : 0,
        nonBlocking: 0,
        byImpact: { low: 0, medium: 0, high: hasFindings ? 1 : 0 },
      },
      summary: hasFindings ? "One issue." : "No issues.",
      criteriaCoverage: { status: "complete" },
      findings: hasFindings
        ? [
            {
              title: "Missing guard",
              description: "The change accepts invalid input.",
              blocksAcceptance: true,
              impact: "high",
              effort: "small",
              confidence: 0.7,
            },
          ]
        : [],
    },
  ];
  if (options.partial) {
    results.push({
      status: "failed",
      taskId: "standards",
      mode: "state",
      modelId: "provider/model",
      packetHash: "d".repeat(64),
      failureCode: "missing-structured-output",
    });
  }
  return {
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
    review: { tasks: [{ id: "spec", instructions: "Review.", mode: "change" }] },
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
    results,
  };
}

describe("post-review policy", () => {
  it("does nothing when completed tasks have no findings", () => {
    expect(buildPostReviewInstruction("ask", makeDetails({ findings: false }), output)).toBe(
      undefined,
    );
  });

  it("keeps findings from completed tasks actionable in a partial batch", () => {
    expect(buildPostReviewInstruction("fix", makeDetails({ partial: true }), output)).toContain(
      "Act on available findings from completed tasks",
    );
  });

  it("queues an invisible follow-up turn for interactive policies but not report", () => {
    const sendMessage = vi.fn();
    const pi = { sendMessage } as unknown as ExtensionAPI;

    queuePostReviewTurn(pi, "ask", makeDetails(), output);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        customType: "supi-review-followup",
        display: false,
      }),
      { deliverAs: "followUp", triggerTurn: true },
    );

    sendMessage.mockClear();
    queuePostReviewTurn(pi, "report", makeDetails(), output);
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
