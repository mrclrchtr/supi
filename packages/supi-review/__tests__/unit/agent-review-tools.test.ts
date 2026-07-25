import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createPiMock, getHandlerOrThrow, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prepareAgentReviewPlan: vi.fn(),
  runAgentReviewBatch: vi.fn(),
  recordDebugEvent: vi.fn(),
}));

vi.mock("../../src/tool/agent-review-workflow.ts", () => ({
  prepareAgentReviewPlan: mocks.prepareAgentReviewPlan,
  runAgentReviewBatch: mocks.runAgentReviewBatch,
}));

vi.mock("@mrclrchtr/supi-core/debug", () => ({
  recordDebugEvent: mocks.recordDebugEvent,
}));

import { registerAgentReviewTools } from "../../src/tool/agent-review-tools.ts";
import type {
  AgentReviewBatchDetails,
  BriefCritique,
  ReviewModelSelection,
  ReviewSnapshot,
  SynthesizedReviewBrief,
} from "../../src/types.ts";

const model = {
  canonicalId: "anthropic/claude-sonnet-4",
  provider: "anthropic",
  id: "claude-sonnet-4",
  label: "Claude Sonnet 4",
  description: "anthropic/claude-sonnet-4",
  isCurrent: true,
  model: {
    provider: "anthropic",
    id: "claude-sonnet-4",
    name: "Claude Sonnet 4",
    reasoning: true,
    contextWindow: 200_000,
    maxTokens: 8_000,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  },
} as ReviewModelSelection;

const snapshot: ReviewSnapshot = {
  target: { kind: "working-tree" },
  title: "Working tree changes",
  changedFiles: ["src/auth.ts"],
  diffText: "diff --git a/src/auth.ts b/src/auth.ts\n+guard();",
  stats: { files: 1, additions: 1, deletions: 0 },
};

const brief: SynthesizedReviewBrief = {
  summary: "Guard the auth flow",
  intendedOutcome: "Reject missing tokens",
  constraints: ["Keep the public API stable"],
  focusAreas: ["Authentication"],
  riskyFiles: ["src/auth.ts"],
  unresolvedQuestions: [],
  reviewInstructionBlockIds: [],
};

const critique: BriefCritique = {
  verdict: "accept",
  summary: "The generated brief matches the session evidence.",
  findings: [],
};

function makeToolCtx() {
  return makeCtx({
    model: model.model,
    modelRegistry: {},
    sessionManager: {
      getEntries: () => [],
      getLeafId: () => null,
      getBranch: () => [],
    },
  });
}

function preparedPlan() {
  return {
    id: "review-plan-123",
    snapshot,
    snapshotFingerprint: "snapshot-fingerprint",
    generatedBrief: brief,
    model,
    briefPromptVersion: "1",
    createdAt: 1,
  };
}

function batchDetails(): AgentReviewBatchDetails {
  return {
    kind: "review-batch",
    evaluation: {
      planId: "review-plan-123",
      briefPromptVersion: "1",
      generatedBrief: brief,
      critique,
      effectiveBrief: brief,
      synthesizerModelId: model.canonicalId,
      snapshotFingerprint: "snapshot-fingerprint",
    },
    snapshot: {
      target: snapshot.target,
      title: snapshot.title,
      changedFiles: snapshot.changedFiles,
      stats: snapshot.stats,
    },
    results: [
      {
        assignment: { id: "spec", focus: "Check requested behavior." },
        result: {
          kind: "success",
          modelId: model.canonicalId,
          output: {
            items: [],
            overall_correctness: "PATCH IS CORRECT",
            overall_explanation: "No issues found.",
            overall_confidence_score: 0.9,
            summary: {
              actions: { mustFix: 0, shouldFix: 0, consider: 0 },
              categories: {},
            },
          },
        },
      },
    ],
  };
}

describe("agent review tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prepareAgentReviewPlan.mockResolvedValue({ kind: "prepared", plan: preparedPlan() });
    mocks.runAgentReviewBatch.mockImplementation(
      async (input: {
        onBriefEvaluation?: (evaluation: AgentReviewBatchDetails["evaluation"]) => void;
      }) => {
        const details = batchDetails();
        input.onBriefEvaluation?.(details.evaluation);
        return { kind: "completed", details };
      },
    );
  });

  it("keeps run inactive until prepare returns a plan", async () => {
    const pi = createPiMock();
    registerAgentReviewTools(pi as unknown as ExtensionAPI);
    pi.setActiveTools(["read", "supi_review_prepare", "supi_review_run"]);

    const sessionStart = getHandlerOrThrow(pi, "session_start");
    await sessionStart({}, makeToolCtx());
    expect(pi.getActiveTools()).toEqual(["read", "supi_review_prepare"]);

    const prepare = getTool(pi, "supi_review_prepare");
    const result = (await prepare.execute(
      "prepare-1",
      {},
      undefined,
      undefined,
      makeToolCtx(),
    )) as {
      content: Array<{ type: string; text: string }>;
      details: { kind: string; planId: string; snapshot: Record<string, unknown> };
    };

    expect(result.details).toMatchObject({
      kind: "review-prepared",
      planId: "review-plan-123",
    });
    expect("diffText" in result.details.snapshot).toBe(false);
    expect(result.content[0]?.text).toContain("## Changed files");
    expect(result.content[0]?.text).toContain("src/auth.ts");
    expect(result.content[0]?.text).toContain("## Generated brief");
    expect(result.content[0]?.text).toContain("Critically compare this brief");
    expect(pi.getActiveTools()).toEqual(["read", "supi_review_prepare", "supi_review_run"]);
  });

  it("rejects incomplete branch targets before brief synthesis", async () => {
    const pi = createPiMock();
    registerAgentReviewTools(pi as unknown as ExtensionAPI);
    const prepare = getTool(pi, "supi_review_prepare");

    await expect(
      prepare.execute(
        "prepare-invalid",
        { target: { kind: "branch" } },
        undefined,
        undefined,
        makeToolCtx(),
      ),
    ).rejects.toThrow('target.base is required when target.kind is "branch".');
    expect(mocks.prepareAgentReviewPlan).not.toHaveBeenCalled();
  });

  it("rejects option-like commit targets before invoking Git workflow", async () => {
    const pi = createPiMock();
    registerAgentReviewTools(pi as unknown as ExtensionAPI);
    const prepare = getTool(pi, "supi_review_prepare");

    await expect(
      prepare.execute(
        "prepare-option-injection",
        { target: { kind: "commit", sha: "--output=/tmp/supi-review-injected" } },
        undefined,
        undefined,
        makeToolCtx(),
      ),
    ).rejects.toThrow("target.sha must be a hexadecimal commit object id");
    expect(mocks.prepareAgentReviewPlan).not.toHaveBeenCalled();
  });

  it("passes the visible main-agent critique into run and records an evaluation event", async () => {
    const pi = createPiMock();
    registerAgentReviewTools(pi as unknown as ExtensionAPI);
    const run = getTool(pi, "supi_review_run");

    const result = (await run.execute(
      "run-1",
      {
        planId: "review-plan-123",
        critique,
        reviewers: [{ id: "spec", focus: "Check requested behavior." }],
      },
      undefined,
      undefined,
      makeToolCtx(),
    )) as {
      content: Array<{ type: string; text: string }>;
      details: AgentReviewBatchDetails;
    };

    expect(mocks.runAgentReviewBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        planId: "review-plan-123",
        critique,
        reviewers: [{ id: "spec", focus: "Check requested behavior." }],
      }),
    );
    expect(result.content[0]?.text).toContain("Brief critique: ACCEPT");
    expect(result.content[0]?.text).toContain(critique.summary);
    expect(result.details.evaluation.critique).toEqual(critique);
    expect("diffText" in result.details.snapshot).toBe(false);
    expect("snapshot" in result.details.results[0].result).toBe(false);
    expect(mocks.recordDebugEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "supi-review",
        category: "brief-critique",
        rawData: result.details.evaluation,
      }),
    );
  });

  it("throws when a prepared plan is stale instead of starting reviewers", async () => {
    const pi = createPiMock();
    registerAgentReviewTools(pi as unknown as ExtensionAPI);
    mocks.runAgentReviewBatch.mockResolvedValue({
      kind: "stale",
      reason: "The review target changed after the brief was prepared.",
    });

    const run = getTool(pi, "supi_review_run");
    await expect(
      run.execute(
        "run-stale",
        {
          planId: "review-plan-123",
          critique,
          reviewers: [{ id: "spec", focus: "Check requested behavior." }],
        },
        undefined,
        undefined,
        makeToolCtx(),
      ),
    ).rejects.toThrow("The review target changed after the brief was prepared.");
  });
});
