import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isRootCommit: vi.fn(),
  materializeReviewWorkspace: vi.fn(),
  resolveReviewSnapshot: vi.fn(),
  validateReviewScope: vi.fn(),
}));

vi.mock("../../src/git.ts", () => ({
  isRootCommit: mocks.isRootCommit,
  resolveReviewSnapshot: mocks.resolveReviewSnapshot,
  summarizeReviewSnapshot: (snapshot: { repositoryRoot: string }) => snapshot,
}));
vi.mock("../../src/review-scope.ts", async (original) => ({
  ...(await original<typeof import("../../src/review-scope.ts")>()),
  validateReviewScope: mocks.validateReviewScope,
}));
vi.mock("../../src/workspace/review-workspace.ts", () => ({
  materializeReviewWorkspace: mocks.materializeReviewWorkspace,
}));

import { runReview } from "../../src/tool/review_run/workflow.ts";
import type { ReviewModelSelection, ReviewSnapshot } from "../../src/types.ts";

const commit = "a".repeat(40);
const snapshot: ReviewSnapshot = {
  repositoryRoot: "/repo",
  requestedTarget: { workingTree: {} },
  target: { fromCommit: commit, toCommit: commit, includeUncommittedChanges: true },
  title: "Filesystem changes",
  changes: [],
  diffHash: "b".repeat(64),
  stats: { files: 0, additions: 0, deletions: 0 },
};
const model = { canonicalId: "provider/reviewer", model: {} } as ReviewModelSelection;

describe("Review Scope cleanup warnings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isRootCommit.mockResolvedValue(false);
  });

  it("returns the cleanup recovery command when frozen-scope validation fails", async () => {
    const cleanup = vi.fn().mockResolvedValue({
      workspacePath: "/tmp/review-workspace",
      message: "Review Workspace cleanup failed; completed review findings remain valid.",
      recoveryCommand: "git worktree remove --force '/tmp/review-workspace'",
    });
    mocks.resolveReviewSnapshot.mockResolvedValue(snapshot);
    mocks.materializeReviewWorkspace.mockResolvedValue({
      cwd: "/tmp/review-workspace",
      receipt: {},
      cleanup,
    });
    mocks.validateReviewScope.mockRejectedValue(
      new Error('Review Scope path "missing.ts" does not exist in the frozen after state.'),
    );

    const outcome = await runReview({
      cwd: "/repo",
      target: {},
      scope: { paths: ["missing.ts"] },
      review: { tasks: [{ id: "state", instructions: "Review state.", mode: "state" }] },
      reviewerModel: model,
    });

    expect(cleanup).toHaveBeenCalledOnce();
    expect(outcome).toEqual({
      kind: "invalid",
      reason:
        "Review Scope path \"missing.ts\" does not exist in the frozen after state. Review Workspace cleanup warning: Review Workspace cleanup failed; completed review findings remain valid. Recovery: git worktree remove --force '/tmp/review-workspace'",
    });
  });

  it("cleans the Review Workspace before it propagates scope-validation cancellation", async () => {
    const cleanup = vi.fn().mockResolvedValue(undefined);
    const controller = new AbortController();
    mocks.resolveReviewSnapshot.mockResolvedValue(snapshot);
    mocks.materializeReviewWorkspace.mockResolvedValue({
      cwd: "/tmp/review-workspace",
      receipt: {},
      cleanup,
    });
    mocks.validateReviewScope.mockImplementation(async () => {
      controller.abort();
      controller.signal.throwIfAborted();
    });

    await expect(
      runReview({
        cwd: "/repo",
        target: {},
        scope: { paths: ["src"] },
        review: { tasks: [{ id: "state", instructions: "Review state.", mode: "state" }] },
        reviewerModel: model,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(cleanup).toHaveBeenCalledOnce();
  });
});
