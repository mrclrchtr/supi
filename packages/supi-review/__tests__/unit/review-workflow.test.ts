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
  requestedTarget: { kind: "working-tree" },
  target: { kind: "working-tree", headCommit: "a".repeat(40) },
  title: "Working tree changes",
  changedFiles: ["src/a.ts"],
  diffText: "+change",
  stats: { files: 1, additions: 1, deletions: 0 },
};
const model = { canonicalId: "provider/model", model: {} } as ReviewModelSelection;
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
    expect(outcome.details.results.map((result) => result.taskId)).toEqual(["standards", "spec"]);
    expect(outcome.details.results.every((result) => result.status === "completed")).toBe(true);
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

  it("bounds the Planner changed-file manifest", async () => {
    mocks.resolveReviewSnapshot.mockResolvedValue({
      ...snapshot,
      changedFiles: Array.from(
        { length: 1_000 },
        (_, index) => `src/${index}-${"x".repeat(100)}.ts`,
      ),
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
    const manifest = prompt.split("## Changed file names\n")[1]?.split("\n\n## Bounded")[0] ?? "";
    expect(manifest.length).toBeLessThanOrEqual(8_000);
    expect(manifest).toContain("additional file(s) omitted");
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

  it("atomically consumes a plan even when its explicit decision is invalid", async () => {
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
    expect(retry.kind).toBe("invalid");
  });
});
