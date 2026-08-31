import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runReview: vi.fn(),
  resolveAgentReviewModel: vi.fn(),
  resolveRecoveryReviewModel: vi.fn(),
  loadReviewConfig: vi.fn(),
  spinnerStart: vi.fn(),
}));
vi.mock("@mrclrchtr/supi-core/status-spinner", () => ({
  StatusSpinner: class {
    start() {
      mocks.spinnerStart();
    }
    update() {}
    stop() {}
  },
}));
vi.mock("../../src/config.ts", () => ({ loadReviewConfig: mocks.loadReviewConfig }));
vi.mock("../../src/model.ts", () => ({
  CURRENT_SESSION_REVIEW_MODEL: "current",
  resolveAgentReviewModel: mocks.resolveAgentReviewModel,
  resolveRecoveryReviewModel: mocks.resolveRecoveryReviewModel,
}));
vi.mock("../../src/tool/review_run/workflow.ts", () => ({ runReview: mocks.runReview }));

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { ReviewArtifactStore } from "../../src/session/review-artifact-store.ts";
import { MAX_PAGE_CHARACTERS, MAX_PAGE_LINES } from "../../src/tool/output-page.ts";
import { registerReviewRunTool } from "../../src/tool/review_run/register.ts";
import type { ReviewBatchDetails, ReviewModelSelection } from "../../src/types.ts";

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
    changes: [{ status: "M", path: "a.ts", additions: 1, deletions: 0 }],
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
  results: [
    {
      status: "completed",
      taskId: "spec",
      mode: "change",
      modelId: "provider/model",
      requestedThinkingLevel: "max",
      effectiveThinkingLevel: "max",
      packetHash: "c".repeat(64),
      verdict: "pass",
      findingCounts: {
        total: 0,
        blocking: 0,
        nonBlocking: 0,
        byImpact: { low: 0, medium: 0, high: 0 },
      },
      summary: "No issues.",
      findings: [],
      criteriaCoverage: { status: "complete" },
    },
  ],
};

describe("agent review tool usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadReviewConfig.mockReturnValue({
      agentModel: "provider/model",
      reviewerThinkingLevel: "high",
      recoveryModel: "disabled",
      auditEnabled: false,
      bootstrapCommand: "",
      postReviewPolicy: "ask",
    });
    mocks.resolveAgentReviewModel.mockReturnValue({
      canonicalId: "provider/model",
      model: {},
    } as ReviewModelSelection);
    mocks.runReview.mockResolvedValue({ kind: "completed", details });
  });

  it("does not start status UI when the execution context has no UI", async () => {
    const pi = createPiMock();
    registerReviewRunTool(pi as unknown as ExtensionAPI, new ReviewArtifactStore());
    const ctx = { ...makeCtx(), hasUI: false };

    await getTool(pi, "review_run").execute(
      "call",
      { tasks: [{ id: "spec", instructions: "Review.", mode: "change" }] },
      undefined,
      undefined,
      ctx,
    );

    expect(mocks.spinnerStart).not.toHaveBeenCalled();
  });

  it("passes the flat target and task mode into the Review workflow", async () => {
    const pi = createPiMock();
    registerReviewRunTool(pi as unknown as ExtensionAPI, new ReviewArtifactStore());
    await getTool(pi, "review_run").execute(
      "call",
      {
        target: {},
        paths: ["src/a.ts"],
        tasks: [{ id: "spec", instructions: "Review.", mode: "change" }],
      },
      undefined,
      undefined,
      makeCtx(),
    );

    expect(mocks.runReview).toHaveBeenCalledWith(
      expect.objectContaining({
        target: {},
        scope: { paths: ["src/a.ts"] },
        review: { tasks: [{ id: "spec", instructions: "Review.", mode: "change" }] },
        reviewerThinkingLevel: "high",
      }),
    );
  });

  it("reserves the output envelope for post-review guidance", async () => {
    const findings = Array.from({ length: 20 }, (_, index) => ({
      title: `Finding ${index}`,
      description: "evidence\n".repeat(150),
      blocksAcceptance: true,
      impact: "medium" as const,
      effort: "small" as const,
      confidence: 1,
    }));
    const result = details.results[0];
    if (result?.status !== "completed") throw new Error("Expected completed fixture.");
    mocks.runReview.mockResolvedValueOnce({
      kind: "completed",
      details: {
        ...details,
        results: [
          {
            ...result,
            verdict: "issues",
            findings,
            findingCounts: {
              total: findings.length,
              blocking: findings.length,
              nonBlocking: 0,
              byImpact: { low: 0, medium: findings.length, high: 0 },
            },
          },
        ],
      },
    });
    const pi = createPiMock();
    registerReviewRunTool(pi as unknown as ExtensionAPI, new ReviewArtifactStore());

    const output = (await getTool(pi, "review_run").execute(
      "call",
      { tasks: [{ id: "spec", instructions: "Review.", mode: "change" }] },
      undefined,
      undefined,
      makeCtx(),
    )) as { content: Array<{ text: string }> };
    const text = output.content[0]?.text ?? "";

    expect(text.length).toBeLessThanOrEqual(MAX_PAGE_CHARACTERS);
    expect(text.split("\n").length).toBeLessThanOrEqual(MAX_PAGE_LINES);
    expect(text).toContain("post-review-policy");
  });
});
