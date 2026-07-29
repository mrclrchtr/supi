import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  materialize: vi.fn(),
  resolveReviewSnapshot: vi.fn(),
  runReviewer: vi.fn(),
}));
vi.mock("../../src/git.ts", async (original) => ({
  ...(await original()),
  resolveReviewSnapshot: mocks.resolveReviewSnapshot,
}));
vi.mock("../../src/tool/review-runner.ts", () => ({ runReviewer: mocks.runReviewer }));
vi.mock("../../src/workspace/review-workspace.ts", async (original) => ({
  ...(await original()),
  materializeReviewWorkspace: mocks.materialize,
}));

import { ReviewPlanStore } from "../../src/session/review-plan-store.ts";
import { prepareReview, runReview } from "../../src/tool/review-workflow.ts";
import type { ReviewModelSelection, ReviewSnapshot } from "../../src/types.ts";

const snapshot: ReviewSnapshot = {
  repositoryRoot: "/source",
  requestedTarget: { kind: "working-tree" },
  target: { kind: "working-tree", headCommit: "a".repeat(40) },
  title: "Working tree changes",
  changes: [{ status: "M", path: "a.ts", additions: 1, deletions: 0 }],
  diffHash: "b".repeat(64),
  stats: { files: 1, additions: 1, deletions: 0 },
};
const model = { canonicalId: "provider/model", model: {} } as ReviewModelSelection;
const review = { tasks: [{ id: "spec", instructions: "Check the spec." }] };

describe("Prepared Review snapshot drift", () => {
  it("reports target revalidation failure without claiming target drift", async () => {
    mocks.resolveReviewSnapshot
      .mockResolvedValueOnce(snapshot)
      .mockRejectedValueOnce(new Error("Git failed"));
    const store = new ReviewPlanStore();
    const prepared = await prepareReview({
      cwd: "/source",
      target: { kind: "working-tree" },
      planning: "none",
      plannerContext: "",
      reviewerModel: model,
      planStore: store,
    });
    expect(prepared.kind).toBe("prepared");
    if (prepared.kind !== "prepared") return;

    await expect(
      runReview({
        mode: "prepared",
        cwd: "/source",
        planId: prepared.plan.id,
        decision: { kind: "use-review", review },
        planStore: store,
      }),
    ).resolves.toEqual({
      kind: "invalid",
      reason: "Could not revalidate this Review Plan target. Prepare a new plan.",
    });
  });

  it("invalidates a plan before creating reviewer sessions when its pinned target changes", async () => {
    mocks.resolveReviewSnapshot.mockResolvedValueOnce(snapshot).mockResolvedValueOnce({
      ...snapshot,
      diffHash: "c".repeat(64),
    });
    const store = new ReviewPlanStore();
    const prepared = await prepareReview({
      cwd: "/source",
      target: { kind: "working-tree" },
      planning: "none",
      plannerContext: "",
      reviewerModel: model,
      planStore: store,
    });
    expect(prepared.kind).toBe("prepared");
    if (prepared.kind !== "prepared") return;

    const outcome = await runReview({
      mode: "prepared",
      cwd: "/source",
      planId: prepared.plan.id,
      decision: { kind: "use-review", review },
      planStore: store,
    });

    expect(outcome).toEqual({
      kind: "invalid",
      reason: "This Review Plan is stale because its target changed. Prepare a new plan.",
    });
    expect(mocks.materialize).not.toHaveBeenCalled();
    expect(mocks.runReviewer).not.toHaveBeenCalled();
    expect(store.peek(prepared.plan.id)).toBeUndefined();
  });
});
