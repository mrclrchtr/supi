import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAgentSession: vi.fn(),
  resolveReviewSnapshot: vi.fn(),
  fingerprintReviewSnapshot: vi.fn(() => "snapshot-fingerprint"),
  checkReviewSnapshotFreshness: vi.fn(async () => ({ fresh: true as const })),
}));

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@earendil-works/pi-coding-agent")>();
  return {
    ...actual,
    createAgentSession: mocks.createAgentSession,
    DefaultResourceLoader: class MockDefaultResourceLoader {
      reload = vi.fn(async () => undefined);
    },
  };
});

vi.mock("../../src/git.ts", () => ({
  resolveReviewSnapshot: mocks.resolveReviewSnapshot,
  fingerprintReviewSnapshot: mocks.fingerprintReviewSnapshot,
  checkReviewSnapshotFreshness: mocks.checkReviewSnapshotFreshness,
  summarizeReviewSnapshot: (snapshot: typeof reviewSnapshot) => ({
    target: snapshot.target,
    title: snapshot.title,
    changedFiles: snapshot.changedFiles,
    stats: snapshot.stats,
  }),
}));

import { ReviewPlanStore } from "../../src/session/review-plan-store.ts";
import {
  prepareAgentReviewPlan,
  runAgentReviewBatch,
} from "../../src/tool/agent-review-workflow.ts";
import type {
  ReviewModelSelection,
  ReviewSnapshot,
  SynthesizedReviewBrief,
} from "../../src/types.ts";
import { formatBriefSynthesisFailureContent } from "../../src/ui/format-content.ts";
import { formatAgentReviewBatch } from "../../src/ui/review-tool-format.ts";

const reviewSnapshot: ReviewSnapshot = {
  target: { kind: "working-tree" },
  title: "Working tree changes",
  changedFiles: ["src/auth.ts"],
  diffText: "diff --git a/src/auth.ts b/src/auth.ts\n+guard();",
  stats: { files: 1, additions: 1, deletions: 0 },
};

const brief: SynthesizedReviewBrief = {
  summary: "Guard auth",
  intendedOutcome: "Reject missing tokens",
  constraints: [],
  focusAreas: ["Authentication"],
  riskyFiles: ["src/auth.ts"],
  unresolvedQuestions: [],
  reviewInstructionBlockIds: [],
};

const model = {
  canonicalId: "anthropic/test-model",
  provider: "anthropic",
  id: "test-model",
  label: "Test Model",
  description: "anthropic/test-model",
  isCurrent: true,
  model: {
    provider: "anthropic",
    id: "test-model",
    name: "Test Model",
    reasoning: false,
    contextWindow: 200_000,
    maxTokens: 8_000,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  },
} as ReviewModelSelection;

function createFailedChildSession(events: Array<Record<string, unknown>>) {
  let listener: ((event: Record<string, unknown>) => void) | undefined;
  return {
    getActiveToolNames: () => ["submit_review", "submit_review_brief"],
    getSessionStats: () => ({ tokens: { input: 3, output: 2, total: 5 } }),
    messages: [
      {
        role: "assistant",
        content: "private assistant text",
        stopReason: "error",
        errorMessage: "private assistant error",
      },
    ],
    subscribe(callback: (event: Record<string, unknown>) => void) {
      listener = callback;
      return () => {};
    },
    async prompt(_prompt: string, options?: { preflightResult?: (accepted: boolean) => void }) {
      options?.preflightResult?.(true);
      for (const event of events) listener?.(event);
    },
    async steer() {},
    async abort() {},
    dispose() {},
  };
}

describe("failure diagnostics propagation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveReviewSnapshot.mockResolvedValue(reviewSnapshot);
    mocks.fingerprintReviewSnapshot.mockReturnValue("snapshot-fingerprint");
    mocks.checkReviewSnapshotFreshness.mockResolvedValue({ fresh: true });
  });

  it("propagates a brief child trace through preparation and parent formatting", async () => {
    mocks.createAgentSession.mockResolvedValue({
      session: createFailedChildSession([{ type: "agent_start" }, { type: "agent_settled" }]),
    });

    const outcome = await prepareAgentReviewPlan({
      cwd: "/project",
      target: { kind: "working-tree" },
      serializedContext: "[User]\nReview this.",
      model,
      planStore: new ReviewPlanStore(),
    });

    expect(outcome.kind).toBe("synthesis-failed");
    if (outcome.kind !== "synthesis-failed") return;
    const content = formatBriefSynthesisFailureContent(outcome.result);
    expect(outcome.result.diagnostics?.lifecycleTrace.entries).toEqual([
      { type: "agent_start" },
      { type: "agent_settled" },
    ]);
    expect(content).toContain("agent_start → agent_settled");
    expect(JSON.stringify(outcome)).not.toContain("private assistant text");
    expect(content).not.toContain("private assistant error");
  });

  it("propagates a reviewer child trace through workflow details and batch text", async () => {
    mocks.createAgentSession.mockResolvedValue({
      session: createFailedChildSession([
        { type: "agent_start" },
        {
          type: "compaction_end",
          reason: "overflow",
          aborted: false,
          willRetry: false,
          result: undefined,
          errorMessage: "private compaction error",
        },
        { type: "agent_settled" },
      ]),
    });
    const store = new ReviewPlanStore();
    const plan = store.create({
      snapshot: reviewSnapshot,
      snapshotFingerprint: "snapshot-fingerprint",
      generatedBrief: brief,
      model,
      briefPromptVersion: "test-v1",
    });

    const outcome = await runAgentReviewBatch({
      cwd: "/project",
      planId: plan.id,
      critique: { verdict: "accept", summary: "Brief is accurate.", findings: [] },
      reviewers: [{ id: "spec", focus: "Check the requested behavior." }],
      planStore: store,
    });

    expect(outcome.kind).toBe("completed");
    if (outcome.kind !== "completed") return;
    const result = outcome.details.results[0]?.result;
    expect(result?.kind).toBe("failed");
    if (result?.kind !== "failed") return;
    expect(result.failureCode).toBe("missing-structured-output");
    if (result.failureCode === "session-creation-failed") return;
    expect(result.diagnostics.lifecycleTrace.entries).toEqual([
      { type: "agent_start" },
      {
        type: "compaction_end",
        reason: "overflow",
        aborted: false,
        willRetry: false,
        hasResult: false,
        hasError: true,
      },
      { type: "agent_settled" },
    ]);
    const content = formatAgentReviewBatch(outcome.details);
    expect(content).toContain("agent_start → compaction_end");
    expect(JSON.stringify(outcome.details)).not.toContain("private compaction error");
    expect(content).not.toContain("private assistant text");
  });
});
