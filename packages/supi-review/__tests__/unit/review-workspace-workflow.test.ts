import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cleanup: vi.fn(),
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

import { runReview } from "../../src/tool/review-workflow.ts";
import type { ReviewModelSelection, ReviewSnapshot } from "../../src/types.ts";

const snapshot: ReviewSnapshot = {
  repositoryRoot: "/source",
  requestedTarget: {},
  target: { fromCommit: "a".repeat(40), toCommit: "a".repeat(40), includeUncommittedChanges: true },
  title: "Filesystem changes",
  changes: [{ status: "M", path: "a.ts", additions: 1, deletions: 0 }],
  diffHash: "b".repeat(64),
  stats: { files: 1, additions: 1, deletions: 0 },
};
const model = { canonicalId: "provider/model", model: {} } as ReviewModelSelection;

describe("runReview Review Workspace boundary", () => {
  it("shares one frozen workspace across concurrent tasks and cleans it after child completion", async () => {
    mocks.resolveReviewSnapshot.mockResolvedValue(snapshot);
    mocks.materialize.mockResolvedValue({
      cwd: "/frozen",
      cleanup: mocks.cleanup,
      receipt: {
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
    });
    mocks.runReviewer.mockResolvedValue({
      kind: "success",
      modelId: model.canonicalId,
      reviewerExtensionSetStatus: "active",
      value: { summary: "Done", findings: [], criteriaCoverage: { status: "complete" } },
    });

    await runReview({
      cwd: "/source",
      target: {},
      reviewerModel: model,
      review: {
        tasks: [
          { id: "standards", instructions: "Check standards.", mode: "change" },
          { id: "spec", instructions: "Check the spec.", mode: "change" },
        ],
      },
    });

    expect(mocks.materialize).toHaveBeenCalledOnce();
    expect(mocks.runReviewer).toHaveBeenCalledTimes(2);
    expect(mocks.runReviewer).toHaveBeenCalledWith(expect.objectContaining({ cwd: "/frozen" }));
    expect(mocks.cleanup).toHaveBeenCalledOnce();
  });
});
