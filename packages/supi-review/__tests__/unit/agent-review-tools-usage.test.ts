import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runReview: vi.fn(),
  prepareReview: vi.fn(),
  resolveAgentReviewModel: vi.fn(),
  loadReviewConfig: vi.fn(),
}));

vi.mock("@mrclrchtr/supi-core/status-spinner", () => ({
  StatusSpinner: class {
    start() {}
    update() {}
    stop() {}
  },
}));
vi.mock("../../src/config.ts", () => ({
  loadReviewConfig: mocks.loadReviewConfig,
}));
vi.mock("../../src/model.ts", () => ({
  resolveAgentReviewModel: mocks.resolveAgentReviewModel,
}));
vi.mock("../../src/tool/review-workflow.ts", () => ({
  prepareReview: mocks.prepareReview,
  runReview: mocks.runReview,
}));

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { ReviewArtifactStore } from "../../src/session/review-artifact-store.ts";
import { ReviewPlanStore } from "../../src/session/review-plan-store.ts";
import { registerAgentReviewTools } from "../../src/tool/agent-review-tools.ts";
import type { ReviewBatchDetails, ReviewModelSelection } from "../../src/types.ts";

const usage = {
  input: 10,
  output: 5,
  cacheRead: 2,
  cacheWrite: 1,
  totalTokens: 18,
  cost: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, total: 10 },
};
const details: ReviewBatchDetails = {
  kind: "review-batch",
  mode: "direct",
  provenance: "caller-supplied",
  snapshot: {
    requestedTarget: { kind: "working-tree" },
    target: { kind: "working-tree", headCommit: "a".repeat(40) },
    title: "Working tree",
    changes: [{ status: "M", path: "a.ts", additions: 1, deletions: 0 }],
    diffHash: "b".repeat(64),
    stats: { files: 1, additions: 1, deletions: 0 },
  },
  review: { tasks: [{ id: "spec", instructions: "Review." }] },
  workspaceReceipt: {
    status: "verified",
    targetKind: "working-tree",
    baselineRevision: "a".repeat(40),
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
      modelId: "provider/model",
      packetHash: "c".repeat(64),
      usage,
      verdict: "pass",
      findingCounts: {
        total: 0,
        blocking: 0,
        nonBlocking: 0,
        byImpact: { low: 0, medium: 0, high: 0 },
      },
      summary: "No issues.",
      findings: [],
    },
  ],
};

function detailsWithFinding(): ReviewBatchDetails {
  return {
    ...details,
    results: [
      {
        status: "completed",
        taskId: "spec",
        modelId: "provider/model",
        packetHash: "c".repeat(64),
        verdict: "issues",
        findingCounts: {
          total: 1,
          blocking: 1,
          nonBlocking: 0,
          byImpact: { low: 0, medium: 0, high: 1 },
        },
        summary: "One issue.",
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
}

describe("agent review tool usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadReviewConfig.mockReturnValue({
      agentModel: "provider/model",
      plannerModel: "provider/model",
      auditEnabled: false,
      bootstrapCommand: "",
      postReviewPolicy: "ask",
    });
    mocks.resolveAgentReviewModel.mockReturnValue({
      canonicalId: "provider/model",
      model: {},
    } as ReviewModelSelection);
    mocks.runReview.mockResolvedValue({ kind: "completed", details, usage });
    mocks.prepareReview.mockResolvedValue({
      kind: "prepared",
      usage,
      plan: {
        id: "review-plan-test",
        snapshot: { repositoryRoot: "/repo", ...details.snapshot },
        reviewerModel: { canonicalId: "provider/model", model: {} },
        plannerDraft: details.review,
        plannerModelId: "provider/model",
        plannerPromptVersion: "2",
        plannerUsage: usage,
      },
    });
  });

  it("returns combined child usage on the persisted tool result", async () => {
    const pi = createPiMock();
    registerAgentReviewTools(
      pi as unknown as ExtensionAPI,
      new ReviewPlanStore(),
      new ReviewArtifactStore(),
    );
    const tool = getTool(pi, "supi_review_run");

    const result = (await tool.execute(
      "call",
      {
        direct: {
          target: { workingTree: {} },
          tasks: [{ id: "spec", instructions: "Review." }],
        },
      },
      undefined,
      undefined,
      makeCtx(),
    )) as { usage?: unknown; details?: ReviewBatchDetails };

    expect(result.usage).toBe(usage);
    expect(result.details?.results[0]?.usage).toBe(usage);
    expect(result.details?.output?.artifactId).toMatch(/^review-output-/);
  });

  it("returns the configured post-review instruction with findings", async () => {
    mocks.runReview.mockResolvedValueOnce({ kind: "completed", details: detailsWithFinding() });
    const pi = createPiMock();
    registerAgentReviewTools(
      pi as unknown as ExtensionAPI,
      new ReviewPlanStore(),
      new ReviewArtifactStore(),
    );

    const result = (await getTool(pi, "supi_review_run").execute(
      "call",
      {
        direct: {
          target: { workingTree: {} },
          tasks: [{ id: "spec", instructions: "Review." }],
        },
      },
      undefined,
      undefined,
      makeCtx(),
    )) as { content?: Array<{ text: string }> };

    expect(result.content?.[0]?.text).toContain('kind="post-review-policy" policy="ask"');
    expect(result.content?.[0]?.text).toContain("Fix selected");
  });

  it("passes the local replay store into every review when enabled", async () => {
    const pi = createPiMock();
    const localAuditStore = { create: vi.fn() } as never;
    mocks.loadReviewConfig.mockReturnValue({
      agentModel: "provider/model",
      plannerModel: "provider/model",
      auditEnabled: true,
      bootstrapCommand: "",
      postReviewPolicy: "ask",
    });
    registerAgentReviewTools(
      pi as unknown as ExtensionAPI,
      new ReviewPlanStore(),
      new ReviewArtifactStore(),
      localAuditStore,
    );

    await getTool(pi, "supi_review_run").execute(
      "call",
      {
        direct: {
          target: { workingTree: {} },
          tasks: [{ id: "spec", instructions: "Review." }],
        },
      },
      undefined,
      undefined,
      makeCtx(),
    );

    expect(mocks.runReview).toHaveBeenCalledWith(
      expect.objectContaining({ auditStore: localAuditStore }),
    );
  });

  it("returns Planner usage on the preparation tool result", async () => {
    const pi = createPiMock();
    registerAgentReviewTools(
      pi as unknown as ExtensionAPI,
      new ReviewPlanStore(),
      new ReviewArtifactStore(),
    );
    const tool = getTool(pi, "supi_review_prepare");
    const ctx = makeCtx({
      sessionManager: {
        getEntries: vi.fn(() => []),
        getLeafId: vi.fn(() => null),
      },
    });

    const result = (await tool.execute(
      "call",
      { planning: "suggest" },
      undefined,
      undefined,
      ctx,
    )) as {
      content?: Array<{ text: string }>;
      usage?: unknown;
      details?: { plannerUsage?: unknown; output?: { artifactId: string } };
    };

    expect(result.usage).toBe(usage);
    expect(result.details?.plannerUsage).toBe(usage);
    expect(result.details?.output?.artifactId).toMatch(/^review-output-/);
    expect(result.content?.[0]?.text).toContain("draftDecision: { useDraft: {} }");
  });
});
