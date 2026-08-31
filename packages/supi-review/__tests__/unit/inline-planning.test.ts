import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isRootCommit: vi.fn(),
  materializeReviewWorkspace: vi.fn(),
  resolveReviewSnapshot: vi.fn(),
  runPlanner: vi.fn(),
  runReviewer: vi.fn(),
}));
vi.mock("../../src/git.ts", async (original) => ({
  ...(await original()),
  isRootCommit: mocks.isRootCommit,
  resolveReviewSnapshot: mocks.resolveReviewSnapshot,
}));
vi.mock("../../src/tool/review_run/planner.ts", () => ({
  PLANNER_PROMPT_VERSION: "test-v1",
  runPlanner: mocks.runPlanner,
}));
vi.mock("../../src/tool/review_run/runner.ts", () => ({ runReviewer: mocks.runReviewer }));
vi.mock("../../src/workspace/review-workspace.ts", async (original) => ({
  ...(await original()),
  materializeReviewWorkspace: mocks.materializeReviewWorkspace,
}));

import { draftReviewTasks, runReview } from "../../src/tool/review_run/workflow.ts";
import type { ReviewModelSelection, ReviewSnapshot } from "../../src/types.ts";

const head = "a".repeat(40);
const snapshot: ReviewSnapshot = {
  repositoryRoot: "/repo",
  requestedTarget: { workingTree: { from: "base" } },
  target: { fromCommit: "b".repeat(40), toCommit: head, includeUncommittedChanges: true },
  title: "Filesystem changes",
  changes: [{ status: "M", path: "src/a.ts", additions: 1, deletions: 0 }],
  diffHash: "c".repeat(64),
  stats: { files: 1, additions: 1, deletions: 0 },
};
const model = { canonicalId: "provider/planner", model: {} } as ReviewModelSelection;
const mixedDraft = {
  tasks: [
    { id: "change", instructions: "Check the change.", mode: "change" as const },
    { id: "state", instructions: "Check the state.", mode: "state" as const },
  ],
};

function input() {
  return {
    cwd: "/repo",
    target: { workingTree: { from: "base" } },
    plannerContext: "Implement issue #289.",
    plannerModel: model,
  };
}

describe("inline Planner Draft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isRootCommit.mockResolvedValue(false);
    mocks.resolveReviewSnapshot.mockResolvedValue(snapshot);
    mocks.runPlanner.mockResolvedValue({ kind: "success", value: mixedDraft });
  });

  it("captures a transient snapshot and preserves mixed required Review Modes", async () => {
    const outcome = await draftReviewTasks(input());

    expect(outcome).toEqual({
      kind: "planned",
      snapshot,
      planning: { modelId: "provider/planner", promptVersion: "test-v1", draft: mixedDraft },
    });
    const prompt = mocks.runPlanner.mock.calls[0]?.[0].prompt as string;
    expect(prompt).toContain("Every task must set Review Mode to change or state.");
    expect(prompt).toContain("A draft may use mixed modes.");
    expect(prompt).toContain("Changed-path inventory");
    expect(prompt).not.toContain("Required Planner Draft mode");
  });

  it("passes the configured Planner thinking level to the Planner child", async () => {
    await draftReviewTasks({ ...input(), plannerThinkingLevel: "high" });

    expect(mocks.runPlanner).toHaveBeenCalledWith(
      expect.objectContaining({ requestedThinkingLevel: "high" }),
    );
  });

  it("includes normalized advisory scope without making it Review Criteria", async () => {
    await draftReviewTasks({
      ...input(),
      scope: { paths: [" ./src/a.ts ", "src/a.ts"] },
    });

    const prompt = mocks.runPlanner.mock.calls[0]?.[0].prompt as string;
    expect(prompt.match(/- "src\/a\.ts"/g)).toHaveLength(1);
    expect(prompt).toContain("This scope is not Review Criteria or an access boundary.");
  });

  it("rejects invalid Planner output and change mode when the selected target has no change", async () => {
    mocks.runPlanner.mockResolvedValueOnce({ kind: "success", value: { tasks: [] } });
    await expect(draftReviewTasks(input())).resolves.toMatchObject({
      kind: "planner-failed",
      result: { kind: "failed", failureCode: "unexpected-runner-failure" },
    });

    mocks.resolveReviewSnapshot.mockResolvedValueOnce({
      ...snapshot,
      changes: [],
      stats: { files: 0, additions: 0, deletions: 0 },
    });
    mocks.runPlanner.mockResolvedValueOnce({ kind: "success", value: mixedDraft });
    await expect(draftReviewTasks(input())).resolves.toMatchObject({
      kind: "planner-failed",
      result: { kind: "failed", failureCode: "unexpected-runner-failure" },
    });
  });

  it("allows a state-only draft against a selected baseline because finalization removes from", async () => {
    mocks.runPlanner.mockResolvedValueOnce({
      kind: "success",
      value: { tasks: [{ id: "state", instructions: "Check the state.", mode: "state" }] },
    });

    await expect(draftReviewTasks(input())).resolves.toMatchObject({
      kind: "planned",
      planning: { draft: { tasks: [{ id: "state", mode: "state" }] } },
    });
  });

  it("does not resolve the captured target again when the final target is identical", async () => {
    const cleanup = vi.fn(async () => undefined);
    mocks.materializeReviewWorkspace.mockResolvedValue({
      cwd: "/frozen",
      cleanup,
      receipt: {
        status: "verified",
        fromCommit: "b".repeat(40),
        toCommit: head,
        includeUncommittedChanges: true,
        expectedWorkspaceHead: "b".repeat(40),
        observedWorkspaceHead: "b".repeat(40),
        expectedDiffHash: snapshot.diffHash,
        observedDiffHash: snapshot.diffHash,
        changedPathCount: 1,
      },
    });
    mocks.runReviewer.mockResolvedValue({
      kind: "success",
      modelId: model.canonicalId,
      reviewerExtensionSetStatus: "active",
      value: { summary: "Done.", findings: [], criteriaCoverage: { status: "complete" } },
    });

    await expect(
      runReview({
        cwd: "/repo",
        target: input().target,
        review: mixedDraft,
        reviewerModel: model,
        expectedSnapshot: snapshot,
        expectedSnapshotTarget: input().target,
      }),
    ).resolves.toMatchObject({ kind: "completed" });

    expect(mocks.resolveReviewSnapshot).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("passes the configured Reviewer thinking level to every task", async () => {
    const cleanup = vi.fn(async () => undefined);
    mocks.materializeReviewWorkspace.mockResolvedValue({
      cwd: "/frozen",
      cleanup,
      receipt: {
        status: "verified",
        fromCommit: "b".repeat(40),
        toCommit: head,
        includeUncommittedChanges: true,
        expectedWorkspaceHead: "b".repeat(40),
        observedWorkspaceHead: "b".repeat(40),
        expectedDiffHash: snapshot.diffHash,
        observedDiffHash: snapshot.diffHash,
        changedPathCount: 1,
      },
    });
    mocks.runReviewer.mockResolvedValue({
      kind: "success",
      modelId: model.canonicalId,
      requestedThinkingLevel: "medium",
      effectiveThinkingLevel: "medium",
      reviewerExtensionSetStatus: "active",
      value: { summary: "Done.", findings: [], criteriaCoverage: { status: "complete" } },
    });

    await expect(
      runReview({
        cwd: "/repo",
        target: input().target,
        review: mixedDraft,
        reviewerModel: model,
        reviewerThinkingLevel: "medium",
      }),
    ).resolves.toMatchObject({ kind: "completed" });

    expect(mocks.runReviewer).toHaveBeenCalledTimes(2);
    for (const [invocation] of mocks.runReviewer.mock.calls) {
      expect(invocation).toMatchObject({ requestedThinkingLevel: "medium" });
    }
  });

  it("revalidates the selected target before final all-state execution", async () => {
    const changedSnapshot = { ...snapshot, diffHash: "d".repeat(64) };
    mocks.resolveReviewSnapshot
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce(changedSnapshot);
    mocks.runPlanner.mockResolvedValueOnce({
      kind: "success",
      value: { tasks: [{ id: "state", instructions: "Check the state.", mode: "state" }] },
    });

    const planned = await draftReviewTasks(input());
    expect(planned.kind).toBe("planned");
    if (planned.kind !== "planned") return;

    await expect(
      runReview({
        cwd: "/repo",
        target: { workingTree: {} },
        review: planned.planning.draft,
        reviewerModel: model,
        expectedSnapshot: planned.snapshot,
        expectedSnapshotTarget: input().target,
      }),
    ).resolves.toEqual({
      kind: "invalid",
      reason: "The review target changed while tasks were edited. Start a new review.",
    });
    expect(mocks.materializeReviewWorkspace).not.toHaveBeenCalled();
    expect(mocks.runReviewer).not.toHaveBeenCalled();
  });
});
