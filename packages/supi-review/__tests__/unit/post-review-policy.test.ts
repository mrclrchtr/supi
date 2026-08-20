import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import {
  buildPostReviewInstruction,
  queuePostReviewTurn,
} from "../../src/tool/review_run/post-policy.ts";
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
  const sharedTail = [
    "Whenever this flow results in fixes, the applicability gate comes first: fix only findings that are current, non-duplicate, compatible with other findings, and actionable against the live checkout.",
    "After non-trivial edits, run an existing targeted check when available; report what ran or why it was skipped.",
  ];

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

  it("pins the exact ask policy text", () => {
    const instruction = buildPostReviewInstruction("ask", makeDetails(), output) ?? "";
    expect(instruction).toContain(
      [
        "Do not inspect or edit yet. Ask the user what to do, using ask_user when available and a plain question otherwise.",
        "Offer: Verify findings, Verify + fix confirmed findings, Fix all, Fix selected, Report only. If Fix selected is chosen, ask which findings in a follow-up selection.",
        ...sharedTail,
      ].join("\n"),
    );
  });

  it("pins the exact verify policy text", () => {
    const instruction = buildPostReviewInstruction("verify", makeDetails(), output) ?? "";
    expect(instruction).toContain(
      [
        "Independently confirm or refute every finding against the reviewed target. Do not edit yet.",
        "Present the verification, then ask whether to fix all confirmed findings, fix selected confirmed findings, or report only.",
        ...sharedTail,
      ].join("\n"),
    );
  });

  it("pins the exact report policy text", () => {
    const instruction = buildPostReviewInstruction("report", makeDetails(), output) ?? "";
    expect(instruction).toContain(
      [
        "Report the review result and stop. Do not verify findings, edit code, or ask a post-review question.",
        ...sharedTail,
      ].join("\n"),
    );
  });

  it("pins the exact fix policy text with the light applicability gate", () => {
    const instruction = buildPostReviewInstruction("fix", makeDetails(), output) ?? "";
    expect(instruction).toContain(
      [
        "Run the light applicability gate first: reject findings that are refuted by evidence, stale, duplicated, incompatible with other findings, or no longer applicable to the live checkout.",
        "Then fix every remaining finding, including non-blocking and low-confidence findings. The light gate suffices; full independent verification is not required.",
        ...sharedTail,
      ].join("\n"),
    );
  });

  it("pins the exact verify-and-fix policy text with full confirmation", () => {
    const instruction = buildPostReviewInstruction("verify-and-fix", makeDetails(), output) ?? "";
    expect(instruction).toContain(
      [
        "Run the applicability gate first: reject findings that are refuted by evidence, stale, duplicated, incompatible with other findings, or no longer applicable to the live checkout.",
        "Then perform full Finding Verification: independently confirm or refute every remaining finding against the reviewed target and the live checkout, and fix only the findings that are confirmed and still apply.",
        ...sharedTail,
      ].join("\n"),
    );
  });

  it("rejects refuted, stale, duplicate, incompatible, and not-applicable findings in both fixing policies", () => {
    for (const policy of ["fix", "verify-and-fix"] as const) {
      const instruction = buildPostReviewInstruction(policy, makeDetails(), output) ?? "";
      expect(instruction).toContain("reject findings that are refuted by evidence");
      expect(instruction).toContain("stale");
      expect(instruction).toContain("duplicated");
      expect(instruction).toContain("incompatible with other findings");
      expect(instruction).toContain("no longer applicable to the live checkout");
    }
  });

  it("removes the unconditional fix wording", () => {
    for (const policy of ["ask", "verify", "verify-and-fix", "fix", "report"] as const) {
      const instruction = buildPostReviewInstruction(policy, makeDetails(), output) ?? "";
      expect(instruction).not.toContain("Fix every reported finding");
      expect(instruction).not.toContain(
        "reconcile duplicate findings and verify incompatible ones",
      );
    }
  });

  it("keeps the applicability gate for every policy that can result in fixes", () => {
    for (const policy of ["ask", "verify", "verify-and-fix", "fix", "report"] as const) {
      const instruction = buildPostReviewInstruction(policy, makeDetails(), output) ?? "";
      expect(instruction).toContain(
        "Whenever this flow results in fixes, the applicability gate comes first",
      );
    }
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
