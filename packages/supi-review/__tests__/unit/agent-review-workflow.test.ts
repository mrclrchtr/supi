import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveReviewSnapshot: vi.fn(),
  fingerprintReviewSnapshot: vi.fn(() => "snapshot-fingerprint"),
  checkReviewSnapshotFreshness: vi.fn(
    async (): Promise<{ fresh: true } | { fresh: false; reason: string }> => ({ fresh: true }),
  ),
  synthesizeReviewBrief: vi.fn(),
  runReviewer: vi.fn(),
}));

vi.mock("../../src/git.ts", () => ({
  resolveReviewSnapshot: mocks.resolveReviewSnapshot,
  fingerprintReviewSnapshot: mocks.fingerprintReviewSnapshot,
  checkReviewSnapshotFreshness: mocks.checkReviewSnapshotFreshness,
  summarizeReviewSnapshot: (snapshot: {
    target: unknown;
    title: string;
    changedFiles: string[];
    stats: unknown;
  }) => ({
    target: snapshot.target,
    title: snapshot.title,
    changedFiles: snapshot.changedFiles,
    stats: snapshot.stats,
  }),
}));

vi.mock("../../src/history/synthesize.ts", () => ({
  BRIEF_SYNTHESIS_PROMPT_VERSION: "test-v1",
  synthesizeReviewBrief: mocks.synthesizeReviewBrief,
}));

vi.mock("../../src/tool/review-runner.ts", () => ({
  runReviewer: mocks.runReviewer,
}));

import { ReviewPlanStore } from "../../src/session/review-plan-store.ts";
import {
  prepareAgentReviewPlan,
  runAgentReviewBatch,
} from "../../src/tool/agent-review-workflow.ts";
import type {
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

const generatedBrief: SynthesizedReviewBrief = {
  summary: "Guard the auth flow",
  intendedOutcome: "Reject missing tokens",
  constraints: ["Keep the public API stable"],
  focusAreas: ["Authentication"],
  riskyFiles: ["src/auth.ts"],
  unresolvedQuestions: [],
  reviewInstructionBlockIds: [],
};

const acceptedCritique: BriefCritique = {
  verdict: "accept",
  summary: "The brief matches the session evidence.",
  findings: [],
};

function evidenceBackedRevisionCritique(): BriefCritique {
  return {
    verdict: "revise",
    summary: "The generated brief needs one evidence-backed correction.",
    findings: [
      {
        kind: "omission",
        field: "focusAreas",
        explanation: "Regression coverage is missing.",
        evidence: "The user requested a regression test.",
        proposedChange: "Add regression coverage to focusAreas.",
      },
    ],
  };
}

function rawSuccess(brief = generatedBrief) {
  return {
    kind: "success" as const,
    output: {
      items: [],
      overall_explanation: "No issues found.",
      overall_confidence_score: 0.9,
    },
    snapshot,
    brief,
    modelId: model.canonicalId,
  };
}

function createStoredPlan(store: ReviewPlanStore) {
  return store.create({
    snapshot,
    snapshotFingerprint: "snapshot-fingerprint",
    generatedBrief,
    model,
    briefPromptVersion: "test-v1",
  });
}

describe("agent review workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveReviewSnapshot.mockResolvedValue(snapshot);
    mocks.fingerprintReviewSnapshot.mockReturnValue("snapshot-fingerprint");
    mocks.checkReviewSnapshotFreshness.mockResolvedValue({ fresh: true });
    mocks.synthesizeReviewBrief.mockResolvedValue({ kind: "success", brief: generatedBrief });
    mocks.runReviewer.mockResolvedValue(rawSuccess());
  });

  it("prepares a versioned plan without starting a reviewer", async () => {
    const store = new ReviewPlanStore();
    const outcome = await prepareAgentReviewPlan({
      cwd: "/project",
      target: { kind: "working-tree" },
      note: "Preserve compatibility",
      serializedContext: "[User]\nPlease guard null tokens.",
      model,
      modelRegistry: {} as never,
      planStore: store,
    });

    expect(outcome.kind).toBe("prepared");
    if (outcome.kind !== "prepared") return;
    expect(outcome.plan.id).toMatch(/^review-plan-/);
    expect(outcome.plan.briefPromptVersion).toBe("test-v1");
    expect(outcome.plan.generatedBrief.note).toBe("Preserve compatibility");
    expect(store.get(outcome.plan.id)).toBe(outcome.plan);
    expect(mocks.runReviewer).not.toHaveBeenCalled();
  });

  it("runs focused reviewers concurrently and consumes the plan", async () => {
    const store = new ReviewPlanStore();
    const plan = createStoredPlan(store);
    const resolvers: Array<(value: ReturnType<typeof rawSuccess>) => void> = [];
    mocks.runReviewer.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );

    const running = runAgentReviewBatch({
      cwd: "/project",
      planId: plan.id,
      critique: acceptedCritique,
      reviewers: [
        { id: "standards", focus: "Check repository standards." },
        { id: "spec", focus: "Check the requested behavior." },
      ],
      modelRegistry: {} as never,
      planStore: store,
    });

    await vi.waitFor(() => expect(mocks.runReviewer).toHaveBeenCalledTimes(2));
    expect(store.get(plan.id)).toBeUndefined();
    for (const resolve of resolvers) resolve(rawSuccess());

    const outcome = await running;
    expect(outcome.kind).toBe("completed");
    if (outcome.kind !== "completed") return;
    expect(outcome.details.results.map((entry) => entry.assignment.id)).toEqual([
      "standards",
      "spec",
    ]);
    expect(outcome.details.evaluation.generatedBrief).toEqual(generatedBrief);
    expect(outcome.details.evaluation.effectiveBrief).toEqual(generatedBrief);
    expect(mocks.runReviewer.mock.calls[0]?.[0]?.prompt).toContain("Check repository standards.");
    expect(mocks.runReviewer.mock.calls[1]?.[0]?.prompt).toContain("Check the requested behavior.");
  });

  it("preserves generated, critique, and revised briefs as separate evaluation data", async () => {
    const store = new ReviewPlanStore();
    const plan = createStoredPlan(store);
    const revisedBrief: SynthesizedReviewBrief = {
      ...generatedBrief,
      focusAreas: ["Authentication", "Null-token tests"],
    };
    const critique: BriefCritique = {
      verdict: "revise",
      summary: "The generated brief omitted the new null-token tests.",
      findings: [
        {
          kind: "omission",
          field: "focusAreas",
          explanation: "Test coverage is not called out.",
          evidence: "The user requested a regression test for missing tokens.",
          proposedChange: "Add null-token tests to focusAreas.",
        },
      ],
    };

    const outcome = await runAgentReviewBatch({
      cwd: "/project",
      planId: plan.id,
      critique,
      revisedBrief,
      reviewers: [{ id: "tests", focus: "Review regression coverage." }],
      modelRegistry: {} as never,
      planStore: store,
    });

    expect(outcome.kind).toBe("completed");
    if (outcome.kind !== "completed") return;
    expect(outcome.details.evaluation.generatedBrief.focusAreas).toEqual(["Authentication"]);
    expect(outcome.details.evaluation.critique).toEqual(critique);
    expect(outcome.details.evaluation.effectiveBrief.focusAreas).toEqual([
      "Authentication",
      "Null-token tests",
    ]);
    expect(mocks.runReviewer).toHaveBeenCalledWith(
      expect.objectContaining({
        brief: expect.objectContaining({ focusAreas: revisedBrief.focusAreas }),
      }),
    );
  });

  it("requires evidence-backed findings for a revise critique", async () => {
    const store = new ReviewPlanStore();
    const plan = createStoredPlan(store);

    const outcome = await runAgentReviewBatch({
      cwd: "/project",
      planId: plan.id,
      critique: { ...acceptedCritique, verdict: "revise", findings: [] },
      revisedBrief: generatedBrief,
      reviewers: [{ id: "spec", focus: "Check behavior." }],
      modelRegistry: {} as never,
      planStore: store,
    });

    expect(outcome).toEqual({
      kind: "invalid",
      reason: 'critique.findings must contain evidence when critique.verdict is "revise".',
    });
    expect(store.get(plan.id)).toBe(plan);
    expect(mocks.runReviewer).not.toHaveBeenCalled();
  });

  it("rejects a revised brief with blank required text without consuming the plan", async () => {
    const store = new ReviewPlanStore();
    const plan = createStoredPlan(store);

    const outcome = await runAgentReviewBatch({
      cwd: "/project",
      planId: plan.id,
      critique: evidenceBackedRevisionCritique(),
      revisedBrief: { ...generatedBrief, summary: "   " },
      reviewers: [{ id: "spec", focus: "Check behavior." }],
      modelRegistry: {} as never,
      planStore: store,
    });

    expect(outcome).toEqual({
      kind: "invalid",
      reason: "revisedBrief.summary and revisedBrief.intendedOutcome must not be blank.",
    });
    expect(store.get(plan.id)).toBe(plan);
    expect(mocks.runReviewer).not.toHaveBeenCalled();
  });

  it("rejects blank revised-brief list entries without consuming the plan", async () => {
    const store = new ReviewPlanStore();
    const plan = createStoredPlan(store);

    const outcome = await runAgentReviewBatch({
      cwd: "/project",
      planId: plan.id,
      critique: evidenceBackedRevisionCritique(),
      revisedBrief: { ...generatedBrief, focusAreas: ["Authentication", " "] },
      reviewers: [{ id: "spec", focus: "Check behavior." }],
      modelRegistry: {} as never,
      planStore: store,
    });

    expect(outcome).toEqual({
      kind: "invalid",
      reason: "revisedBrief arrays must not contain blank entries.",
    });
    expect(store.get(plan.id)).toBe(plan);
    expect(mocks.runReviewer).not.toHaveBeenCalled();
  });

  it("requires a full revised brief for a revise verdict", async () => {
    const store = new ReviewPlanStore();
    const plan = createStoredPlan(store);

    const outcome = await runAgentReviewBatch({
      cwd: "/project",
      planId: plan.id,
      critique: { ...acceptedCritique, verdict: "revise" },
      reviewers: [{ id: "spec", focus: "Check behavior." }],
      modelRegistry: {} as never,
      planStore: store,
    });

    expect(outcome).toEqual({
      kind: "invalid",
      reason: 'revisedBrief is required when critique.verdict is "revise".',
    });
    expect(store.get(plan.id)).toBe(plan);
    expect(mocks.runReviewer).not.toHaveBeenCalled();
  });

  it("rejects results when the snapshot changes during reviewer execution", async () => {
    const store = new ReviewPlanStore();
    const plan = createStoredPlan(store);
    mocks.checkReviewSnapshotFreshness
      .mockResolvedValueOnce({ fresh: true })
      .mockResolvedValueOnce({
        fresh: false,
        reason: "The target changed while reviewing.",
      });

    const outcome = await runAgentReviewBatch({
      cwd: "/project",
      planId: plan.id,
      critique: acceptedCritique,
      reviewers: [{ id: "spec", focus: "Check behavior." }],
      modelRegistry: {} as never,
      planStore: store,
    });

    expect(outcome).toEqual({
      kind: "stale",
      reason: "The review target changed while reviewer sessions were running. Prepare a new plan.",
    });
    expect(store.get(plan.id)).toBeUndefined();
    expect(mocks.runReviewer).toHaveBeenCalledTimes(1);
  });

  it("retains the critique evaluation even when the prepared snapshot has drifted", async () => {
    const store = new ReviewPlanStore();
    const plan = createStoredPlan(store);
    const onBriefEvaluation = vi.fn();
    mocks.checkReviewSnapshotFreshness.mockResolvedValue({
      fresh: false,
      reason: "The review target changed after preparation.",
    });

    const outcome = await runAgentReviewBatch({
      cwd: "/project",
      planId: plan.id,
      critique: acceptedCritique,
      reviewers: [{ id: "spec", focus: "Check behavior." }],
      modelRegistry: {} as never,
      planStore: store,
      onBriefEvaluation,
    });

    expect(outcome).toEqual({
      kind: "stale",
      reason: "The review target changed after preparation.",
    });
    expect(onBriefEvaluation).toHaveBeenCalledWith(
      expect.objectContaining({
        planId: plan.id,
        critique: acceptedCritique,
        generatedBrief,
        effectiveBrief: generatedBrief,
      }),
    );
    expect(store.get(plan.id)).toBeUndefined();
    expect(mocks.runReviewer).not.toHaveBeenCalled();
  });
});
