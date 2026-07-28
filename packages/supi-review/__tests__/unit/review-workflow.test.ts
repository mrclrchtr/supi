import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveReviewSnapshot: vi.fn(),
  runPlanner: vi.fn(),
  runReviewer: vi.fn(),
}));
vi.mock("../../src/git.ts", async (original) => ({
  ...(await original()),
  resolveReviewSnapshot: mocks.resolveReviewSnapshot,
}));
vi.mock("../../src/tool/planner-runner.ts", () => ({
  PLANNER_PROMPT_VERSION: "test-v1",
  runPlanner: mocks.runPlanner,
}));
vi.mock("../../src/tool/review-runner.ts", () => ({ runReviewer: mocks.runReviewer }));

import { ReviewPlanStore } from "../../src/session/review-plan-store.ts";
import { prepareReview, runReview } from "../../src/tool/review-workflow.ts";
import type { ReviewModelSelection, ReviewSnapshot } from "../../src/types.ts";

const snapshot: ReviewSnapshot = {
  repositoryRoot: "/repo",
  requestedTarget: { kind: "working-tree" },
  target: { kind: "working-tree", headCommit: "a".repeat(40) },
  title: "Working tree changes",
  changes: [{ status: "M", path: "src/a.ts", additions: 1, deletions: 0 }],
  diffHash: "b".repeat(64),
  stats: { files: 1, additions: 1, deletions: 0 },
};
const model = { canonicalId: "provider/model", model: {} } as ReviewModelSelection;
const usage = {
  input: 10,
  output: 5,
  cacheRead: 2,
  cacheWrite: 1,
  reasoning: 3,
  totalTokens: 18,
  cost: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, total: 10 },
};
const review = {
  sharedContext: "Shared",
  tasks: [
    { id: "standards", instructions: "Check standards." },
    { id: "spec", instructions: "Check spec." },
  ],
};

describe("Review workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveReviewSnapshot.mockResolvedValue(snapshot);
    mocks.runReviewer.mockResolvedValue({
      kind: "success",
      modelId: model.canonicalId,
      submission: { summary: "Done", findings: [] },
      usage,
    });
  });

  it("runs caller-defined Direct Review tasks independently with packet provenance", async () => {
    const outcome = await runReview({
      mode: "direct",
      cwd: "/repo",
      target: { kind: "working-tree" },
      review,
      reviewerModel: model,
    });

    expect(outcome.kind).toBe("completed");
    if (outcome.kind !== "completed") return;
    expect(mocks.runReviewer).toHaveBeenCalledTimes(2);
    expect(outcome.details.mode).toBe("direct");
    expect(outcome.details.provenance).toBe("caller-supplied");
    expect(outcome.details.snapshot).not.toHaveProperty("repositoryRoot");
    expect(outcome.details.results.map((result) => result.taskId)).toEqual(["standards", "spec"]);
    expect(outcome.details.results.every((result) => result.status === "completed")).toBe(true);
    expect(outcome.details.results.every((result) => result.usage === usage)).toBe(true);
    expect(outcome.usage).toEqual({
      input: 20,
      output: 10,
      cacheRead: 4,
      cacheWrite: 2,
      reasoning: 6,
      totalTokens: 36,
      cost: { input: 2, output: 4, cacheRead: 6, cacheWrite: 8, total: 20 },
    });
    expect(
      outcome.details.results.every((result) => /^[0-9a-f]{64}$/.test(result.packetHash)),
    ).toBe(true);
  });

  it("produces identical packet hashes for equivalent Direct and Prepared inputs", async () => {
    const direct = await runReview({
      mode: "direct",
      cwd: "/repo",
      target: { kind: "working-tree" },
      review,
      reviewerModel: model,
    });
    const store = new ReviewPlanStore();
    const preparedPlan = await prepareReview({
      cwd: "/repo",
      target: { kind: "working-tree" },
      planning: "none",
      plannerContext: "",
      reviewerModel: model,
      planStore: store,
    });
    expect(preparedPlan.kind).toBe("prepared");
    if (direct.kind !== "completed" || preparedPlan.kind !== "prepared") return;

    const prepared = await runReview({
      mode: "prepared",
      cwd: "/repo",
      planId: preparedPlan.plan.id,
      decision: { kind: "use-review", review },
      planStore: store,
    });
    expect(prepared.kind).toBe("completed");
    if (prepared.kind !== "completed") return;

    expect(prepared.details.results.map((result) => result.packetHash)).toEqual(
      direct.details.results.map((result) => result.packetHash),
    );
  });

  it("returns a usable no-draft plan when the configured Planner is unavailable", async () => {
    const outcome = await prepareReview({
      cwd: "/repo",
      target: { kind: "working-tree" },
      planning: "suggest",
      plannerContext: "session",
      reviewerModel: model,
      planStore: new ReviewPlanStore(),
    });

    expect(outcome.kind).toBe("prepared");
    if (outcome.kind !== "prepared") return;
    expect(outcome.plan.plannerFailure).toEqual({
      kind: "failed",
      failureCode: "session-creation-failed",
    });
    expect(mocks.runPlanner).not.toHaveBeenCalled();
  });

  it("returns a usable no-draft plan when the Planner runner throws", async () => {
    mocks.runPlanner.mockRejectedValue(new Error("private Planner runner error"));

    const outcome = await prepareReview({
      cwd: "/repo",
      target: { kind: "working-tree" },
      planning: "suggest",
      plannerContext: "session",
      reviewerModel: model,
      plannerModel: model,
      planStore: new ReviewPlanStore(),
    });

    expect(outcome.kind).toBe("prepared");
    if (outcome.kind !== "prepared") return;
    expect(outcome.plan.plannerFailure).toMatchObject({
      kind: "failed",
      failureCode: "unexpected-runner-failure",
    });
    expect(JSON.stringify(outcome)).not.toContain("private Planner runner error");
  });

  it("returns a usable no-draft plan when the advisory Planner fails", async () => {
    const store = new ReviewPlanStore();
    const plannerUsage = { ...usage, input: 3, totalTokens: 11 };
    mocks.runPlanner.mockResolvedValue({
      kind: "failed",
      failureCode: "missing-structured-output",
      diagnostics: {
        lifecycleTrace: { entries: [], droppedCount: 0 },
        turns: 1,
        toolUses: 0,
      },
      usage: plannerUsage,
    });

    const outcome = await prepareReview({
      cwd: "/repo",
      target: { kind: "working-tree" },
      planning: "suggest",
      plannerContext: "session",
      reviewerModel: model,
      plannerModel: model,
      planStore: store,
    });

    expect(outcome.kind).toBe("prepared");
    if (outcome.kind !== "prepared") return;
    expect(outcome.plan.plannerDraft).toBeUndefined();
    expect(outcome.plan.plannerFailure?.kind).toBe("failed");
    expect(outcome.usage).toBe(plannerUsage);

    const run = await runReview({
      mode: "prepared",
      cwd: "/repo",
      planId: outcome.plan.id,
      decision: { kind: "use-review", review },
      planStore: store,
    });
    expect(run.kind).toBe("completed");
  });

  it("bounds the Planner changed-file manifest", async () => {
    mocks.resolveReviewSnapshot.mockResolvedValue({
      ...snapshot,
      changes: Array.from({ length: 1_000 }, (_, index) => ({
        status: "M",
        path: `src/${index}-${"x".repeat(100)}.ts`,
        additions: 1,
        deletions: 0,
      })),
    });
    mocks.runPlanner.mockResolvedValue({ kind: "success", draft: review });

    await prepareReview({
      cwd: "/repo",
      target: { kind: "working-tree" },
      planning: "suggest",
      plannerContext: "session",
      reviewerModel: model,
      plannerModel: model,
      planStore: new ReviewPlanStore(),
    });

    const prompt = mocks.runPlanner.mock.calls[0]?.[0].prompt as string;
    const manifest =
      prompt.split("## Changed-path inventory\n")[1]?.split("\n\n## Bounded")[0] ?? "";
    expect(manifest.length).toBeLessThanOrEqual(8_000);
    expect(manifest).toContain("additional change(s) omitted");
    expect(prompt).not.toContain("+change");
  });

  it("accepts a Planner Draft once, uses the pinned model, and retains provenance", async () => {
    const store = new ReviewPlanStore();
    mocks.runPlanner.mockResolvedValue({ kind: "success", draft: review });
    const prepared = await prepareReview({
      cwd: "/repo",
      target: { kind: "working-tree" },
      planning: "suggest",
      plannerContext: "session",
      reviewerModel: model,
      plannerModel: model,
      planStore: store,
    });
    expect(prepared.kind).toBe("prepared");
    expect(mocks.runPlanner).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('"src/a.ts"'),
      }),
    );
    expect(mocks.runPlanner.mock.calls[0]?.[0].prompt).not.toContain("+change");
    if (prepared.kind !== "prepared") return;

    const outcome = await runReview({
      mode: "prepared",
      cwd: "/repo",
      planId: prepared.plan.id,
      decision: { kind: "accept-draft" },
      planStore: store,
    });
    expect(outcome.kind).toBe("completed");
    if (outcome.kind !== "completed") return;
    expect(outcome.details.mode).toBe("prepared");
    expect(outcome.details.provenance).toBe("planner-assisted");
    expect(outcome.details.planning?.decision).toBe("accept-draft");
    expect(mocks.runReviewer).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.objectContaining({ canonicalId: model.canonicalId }),
      }),
    );

    const duplicate = await runReview({
      mode: "prepared",
      cwd: "/repo",
      planId: prepared.plan.id,
      decision: { kind: "accept-draft" },
      planStore: store,
    });
    expect(duplicate.kind).toBe("invalid");
  });

  it("marks replacement Prepared Review input as caller-supplied", async () => {
    const store = new ReviewPlanStore();
    mocks.runPlanner.mockResolvedValue({ kind: "success", draft: review });
    const prepared = await prepareReview({
      cwd: "/repo",
      target: { kind: "working-tree" },
      planning: "suggest",
      plannerContext: "session",
      reviewerModel: model,
      plannerModel: model,
      planStore: store,
    });
    expect(prepared.kind).toBe("prepared");
    if (prepared.kind !== "prepared") return;

    const outcome = await runReview({
      mode: "prepared",
      cwd: "/repo",
      planId: prepared.plan.id,
      decision: {
        kind: "use-review",
        review: { tasks: [{ id: "replacement", instructions: "Use caller policy." }] },
      },
      planStore: store,
    });

    expect(outcome.kind).toBe("completed");
    if (outcome.kind !== "completed") return;
    expect(outcome.details.provenance).toBe("caller-supplied");
    expect(outcome.details.planning?.decision).toBe("use-review");
  });

  it("releases a plan when no task produces a structured review", async () => {
    const store = new ReviewPlanStore();
    const prepared = await prepareReview({
      cwd: "/repo",
      target: { kind: "working-tree" },
      planning: "none",
      plannerContext: "",
      reviewerModel: model,
      planStore: store,
    });
    expect(prepared.kind).toBe("prepared");
    if (prepared.kind !== "prepared") return;
    mocks.runReviewer.mockResolvedValueOnce({
      kind: "failed",
      modelId: model.canonicalId,
      failureCode: "prompt-rejected",
      diagnostics: {
        lifecycleTrace: { entries: [], droppedCount: 0 },
        turns: 0,
        toolUses: 0,
      },
    });

    const first = await runReview({
      mode: "prepared",
      cwd: "/repo",
      planId: prepared.plan.id,
      decision: { kind: "use-review", review: { tasks: [review.tasks[0]] } },
      planStore: store,
    });
    expect(first.kind).toBe("completed");

    const retry = await runReview({
      mode: "prepared",
      cwd: "/repo",
      planId: prepared.plan.id,
      decision: { kind: "use-review", review: { tasks: [review.tasks[0]] } },
      planStore: store,
    });
    expect(retry.kind).toBe("completed");
  });

  it("consumes a plan when a mixed batch has at least one completed task", async () => {
    const store = new ReviewPlanStore();
    const prepared = await prepareReview({
      cwd: "/repo",
      target: { kind: "working-tree" },
      planning: "none",
      plannerContext: "",
      reviewerModel: model,
      planStore: store,
    });
    expect(prepared.kind).toBe("prepared");
    if (prepared.kind !== "prepared") return;
    mocks.runReviewer
      .mockResolvedValueOnce({
        kind: "success",
        modelId: model.canonicalId,
        submission: { summary: "Done", findings: [] },
      })
      .mockResolvedValueOnce({
        kind: "failed",
        modelId: model.canonicalId,
        failureCode: "prompt-rejected",
        diagnostics: {
          lifecycleTrace: { entries: [], droppedCount: 0 },
          turns: 0,
          toolUses: 0,
        },
      });

    const first = await runReview({
      mode: "prepared",
      cwd: "/repo",
      planId: prepared.plan.id,
      decision: { kind: "use-review", review },
      planStore: store,
    });
    expect(first.kind).toBe("completed");

    const retry = await runReview({
      mode: "prepared",
      cwd: "/repo",
      planId: prepared.plan.id,
      decision: { kind: "use-review", review },
      planStore: store,
    });
    expect(retry.kind).toBe("invalid");
  });

  it("rejects concurrent execution while a plan is leased", async () => {
    const store = new ReviewPlanStore();
    const prepared = await prepareReview({
      cwd: "/repo",
      target: { kind: "working-tree" },
      planning: "none",
      plannerContext: "",
      reviewerModel: model,
      planStore: store,
    });
    expect(prepared.kind).toBe("prepared");
    if (prepared.kind !== "prepared") return;

    let finishReviewer:
      | ((value: {
          kind: "success";
          modelId: string;
          submission: { summary: string; findings: [] };
        }) => void)
      | undefined;
    mocks.runReviewer.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishReviewer = resolve;
        }),
    );
    const request = {
      mode: "prepared" as const,
      cwd: "/repo",
      planId: prepared.plan.id,
      decision: {
        kind: "use-review" as const,
        review: { tasks: [review.tasks[0]] },
      },
      planStore: store,
    };

    const running = runReview(request);
    await vi.waitFor(() => expect(mocks.runReviewer).toHaveBeenCalledTimes(1));
    const concurrent = await runReview(request);
    expect(concurrent.kind).toBe("invalid");

    finishReviewer?.({
      kind: "success",
      modelId: model.canonicalId,
      submission: { summary: "Done", findings: [] },
    });
    await expect(running).resolves.toMatchObject({ kind: "completed" });
  });

  it("keeps a plan available when its explicit decision is invalid", async () => {
    const store = new ReviewPlanStore();
    const prepared = await prepareReview({
      cwd: "/repo",
      target: { kind: "working-tree" },
      planning: "none",
      plannerContext: "",
      reviewerModel: model,
      planStore: store,
    });
    expect(prepared.kind).toBe("prepared");
    if (prepared.kind !== "prepared") return;

    const invalid = await runReview({
      mode: "prepared",
      cwd: "/repo",
      planId: prepared.plan.id,
      decision: { kind: "accept-draft" },
      planStore: store,
    });
    expect(invalid.kind).toBe("invalid");

    const retry = await runReview({
      mode: "prepared",
      cwd: "/repo",
      planId: prepared.plan.id,
      decision: { kind: "use-review", review },
      planStore: store,
    });
    expect(retry.kind).toBe("completed");
  });
});
