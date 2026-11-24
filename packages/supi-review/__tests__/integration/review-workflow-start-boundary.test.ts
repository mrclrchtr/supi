import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { useRepositoryTemplate } from "@mrclrchtr/supi-test-utils/git";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { git, reviewWorktrees } from "../helpers/git.ts";

const mocks = vi.hoisted(() => ({ runReviewer: vi.fn() }));
vi.mock("../../src/tool/review_run/runner.ts", () => ({ runReviewer: mocks.runReviewer }));

import { executePreparedReview, prepareReview } from "../../src/tool/review_run/workflow.ts";
import type { ReviewModelSelection, ReviewTask } from "../../src/types.ts";

vi.setConfig({ testTimeout: 20_000 });

const initializeRepository = useRepositoryTemplate((cwd) => {
  git(cwd, "init");
  git(cwd, "config", "user.email", "test@example.com");
  git(cwd, "config", "user.name", "Test");
  git(cwd, "config", "commit.gpgsign", "false");
  git(cwd, "config", "core.hooksPath", "/dev/null");
  writeFileSync(join(cwd, "tracked.txt"), "base\n");
  git(cwd, "add", ".");
  git(cwd, "commit", "-m", "base");
});

const model = { canonicalId: "provider/reviewer", model: {} } as ReviewModelSelection;
const changeTask: ReviewTask = { id: "change", instructions: "Review the change.", mode: "change" };

describe("Review start boundary", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "supi-review-start-boundary-"));
    initializeRepository(cwd);
    mocks.runReviewer.mockReset();
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it("freezes the target before execution, so later edits stay out of the reviewed state", async () => {
    writeFileSync(join(cwd, "tracked.txt"), "frozen\n");
    const prepared = await prepareReview({
      cwd,
      target: {},
      review: { tasks: [changeTask] },
      reviewerModel: model,
    });
    expect(prepared.kind).toBe("prepared");
    if (prepared.kind !== "prepared") return;
    expect(prepared.review.workspace.receipt).toMatchObject({
      status: "verified",
      changedPathCount: 1,
    });
    expect(prepared.review.review.tasks.map((task) => task.id)).toEqual(["change"]);
    expect(mocks.runReviewer).not.toHaveBeenCalled();
    expect(reviewWorktrees(cwd)).toHaveLength(1);

    writeFileSync(join(cwd, "tracked.txt"), "edited after start\n");
    mocks.runReviewer.mockImplementation(async (invocation) => {
      expect(readFileSync(join(invocation.cwd, "tracked.txt"), "utf8")).toBe("frozen\n");
      return {
        kind: "success",
        modelId: model.canonicalId,
        reviewerExtensionSetStatus: "active",
        value: { summary: "Reviewed.", findings: [], criteriaCoverage: { status: "complete" } },
      };
    });

    const outcome = await executePreparedReview(prepared.review);

    expect(outcome.kind).toBe("completed");
    expect(outcome.details.results).toMatchObject([{ taskId: "change", status: "completed" }]);
    expect(outcome.details.workspaceReceipt).toEqual(prepared.review.workspace.receipt);
    expect(mocks.runReviewer).toHaveBeenCalledOnce();
    expect(reviewWorktrees(cwd)).toEqual([]);
  });

  it("fails preparation and removes the workspace when the Dependency Bootstrap fails", async () => {
    writeFileSync(join(cwd, "tracked.txt"), "changed\n");
    const prepared = await prepareReview({
      cwd,
      target: {},
      review: { tasks: [changeTask] },
      reviewerModel: model,
      bootstrapCommand: `${process.execPath} -e "process.exit(1)"`,
    });

    expect(prepared).toEqual({
      kind: "invalid",
      reason: "Configured Dependency Bootstrap failed.",
    });
    expect(reviewWorktrees(cwd)).toEqual([]);
    expect(mocks.runReviewer).not.toHaveBeenCalled();
  });

  it("removes the prepared workspace when execution is canceled", async () => {
    writeFileSync(join(cwd, "tracked.txt"), "changed\n");
    const prepared = await prepareReview({
      cwd,
      target: {},
      review: { tasks: [changeTask] },
      reviewerModel: model,
    });
    if (prepared.kind !== "prepared") throw new Error("Expected a prepared Review.");
    const workspacePath = prepared.review.workspace.cwd;
    const controller = new AbortController();
    mocks.runReviewer.mockImplementation(async (invocation) => {
      controller.abort();
      return { kind: "canceled", modelId: model.canonicalId, diagnostics: invocation.diagnostics };
    });

    const outcome = await executePreparedReview(prepared.review, { signal: controller.signal });

    expect(outcome.details.results).toMatchObject([{ taskId: "change", status: "canceled" }]);
    expect(reviewWorktrees(cwd)).toEqual([]);
    expect(existsSync(workspacePath)).toBe(false);
  });
});
