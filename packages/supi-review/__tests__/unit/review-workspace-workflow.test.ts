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
  requestedTarget: { kind: "working-tree" },
  target: { kind: "working-tree", headCommit: "a".repeat(40) },
  title: "Working tree changes",
  changes: [{ status: "M", path: "a.ts", additions: 1, deletions: 0 }],
  diffHash: "b".repeat(64),
  stats: { files: 1, additions: 1, deletions: 0 },
};
const model = { canonicalId: "provider/model", model: {} } as ReviewModelSelection;

describe("runReview Review Workspace boundary", () => {
  it("shares one frozen workspace across concurrent tasks and cleans it after child completion", async () => {
    mocks.resolveReviewSnapshot.mockResolvedValue(snapshot);
    mocks.materialize.mockResolvedValue({ cwd: "/frozen", cleanup: mocks.cleanup });
    mocks.runReviewer.mockResolvedValue({
      kind: "success",
      modelId: model.canonicalId,
      submission: { summary: "Done", findings: [] },
    });

    await runReview({
      mode: "direct",
      cwd: "/source",
      target: { kind: "working-tree" },
      reviewerModel: model,
      review: {
        tasks: [
          { id: "standards", instructions: "Check standards." },
          { id: "spec", instructions: "Check the spec." },
        ],
      },
    });

    expect(mocks.materialize).toHaveBeenCalledOnce();
    expect(mocks.runReviewer).toHaveBeenCalledTimes(2);
    expect(mocks.runReviewer).toHaveBeenCalledWith(expect.objectContaining({ cwd: "/frozen" }));
    expect(mocks.cleanup).toHaveBeenCalledOnce();
  });
});
