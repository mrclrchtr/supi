import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ runReviewer: vi.fn() }));
vi.mock("../../src/tool/review-runner.ts", () => ({ runReviewer: mocks.runReviewer }));

import { resolveReviewSnapshot } from "../../src/git.ts";
import { runReview } from "../../src/tool/review-workflow.ts";
import type {
  ReviewModelSelection,
  ReviewScope,
  ReviewTargetSpec,
  ReviewTask,
} from "../../src/types.ts";
import { materializeReviewWorkspace } from "../../src/workspace/review-workspace.ts";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function initializeRepository(cwd: string): void {
  git(cwd, "init");
  git(cwd, "config", "user.email", "test@example.com");
  git(cwd, "config", "user.name", "Test");
  git(cwd, "config", "commit.gpgsign", "false");
  git(cwd, "config", "tag.gpgSign", "false");
  git(cwd, "config", "core.hooksPath", "/dev/null");
  writeFileSync(join(cwd, "tracked.txt"), "base\n");
  git(cwd, "add", ".");
  git(cwd, "commit", "-m", "base");
}

const model = { canonicalId: "provider/reviewer", model: {} } as ReviewModelSelection;
const stateTask: ReviewTask = { id: "state", instructions: "Review the state.", mode: "state" };
const changeTask: ReviewTask = {
  id: "change",
  instructions: "Review the change.",
  mode: "change",
};

function review(cwd: string, target: ReviewTargetSpec, scope: ReviewScope) {
  return runReview({ cwd, target, scope, review: { tasks: [stateTask] }, reviewerModel: model });
}

function successfulReviewer(): void {
  mocks.runReviewer.mockImplementation(async (invocation) => ({
    kind: "success",
    modelId: model.canonicalId,
    reviewerExtensionSetStatus: "active",
    value: {
      summary: `Reviewed ${invocation.task.id}.`,
      findings: [],
      criteriaCoverage: { status: "complete" },
    },
  }));
}

describe("runReview batch Review Scope", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "supi-review-scope-"));
    initializeRepository(cwd);
    mocks.runReviewer.mockReset();
    successfulReviewer();
  });

  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  it("accepts tracked and non-ignored untracked paths in the current filesystem", async () => {
    writeFileSync(join(cwd, "tracked.txt"), "changed\n");
    writeFileSync(join(cwd, "untracked.txt"), "new\n");

    const outcome = await review(cwd, {}, { paths: ["tracked.txt", "untracked.txt"] });

    expect(outcome.kind).toBe("completed");
    if (outcome.kind !== "completed") return;
    expect(outcome.details.scope).toEqual({ paths: ["tracked.txt", "untracked.txt"] });
    expect(mocks.runReviewer).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: expect.stringContaining('- "untracked.txt"') }),
    );
  });

  it("validates a clean historical scope against the resolved after commit", async () => {
    writeFileSync(join(cwd, "historical.txt"), "historical\n");
    git(cwd, "add", "historical.txt");
    git(cwd, "commit", "-m", "historical");
    const historical = git(cwd, "rev-parse", "HEAD");
    git(cwd, "checkout", "--detach", "HEAD^");

    const outcome = await review(
      cwd,
      { to: historical, includeUncommittedChanges: false },
      { paths: ["historical.txt"] },
    );

    expect(outcome.kind).toBe("completed");
    expect(mocks.runReviewer).toHaveBeenCalledOnce();
  });

  it("rejects a missing scope path before a Reviewer Session starts", async () => {
    const outcome = await review(cwd, {}, { paths: ["missing.txt"] });

    expect(outcome).toEqual({
      kind: "invalid",
      reason: 'Review Scope path "missing.txt" does not exist in the frozen after state.',
    });
    expect(mocks.runReviewer).not.toHaveBeenCalled();
  });

  it("rejects ignored untracked scope content before a Reviewer Session starts", async () => {
    writeFileSync(join(cwd, ".gitignore"), "ignored.txt\n");
    git(cwd, "add", ".gitignore");
    git(cwd, "commit", "-m", "ignore");
    writeFileSync(join(cwd, "ignored.txt"), "ignored\n");

    const outcome = await review(cwd, {}, { paths: ["ignored.txt"] });

    expect(outcome).toEqual({
      kind: "invalid",
      reason:
        'Review Scope path "ignored.txt" is ignored untracked content and is not in the frozen after state.',
    });
    expect(mocks.runReviewer).not.toHaveBeenCalled();
  });

  it("excludes ignored recreated baseline-only content from the workspace and Review Scope", async () => {
    writeFileSync(join(cwd, "baseline-only.txt"), "baseline\n");
    writeFileSync(join(cwd, "visible-baseline.txt"), "baseline\n");
    git(cwd, "add", "baseline-only.txt", "visible-baseline.txt");
    git(cwd, "commit", "-m", "baseline");
    const from = git(cwd, "rev-parse", "HEAD");
    writeFileSync(join(cwd, ".gitignore"), "baseline-only.txt\n");
    unlinkSync(join(cwd, "baseline-only.txt"));
    unlinkSync(join(cwd, "visible-baseline.txt"));
    git(cwd, "add", "-A");
    git(cwd, "commit", "-m", "delete ignored baseline");
    writeFileSync(join(cwd, "baseline-only.txt"), "ignored recreation\n");
    writeFileSync(join(cwd, "visible-baseline.txt"), "visible recreation\n");

    const snapshot = await resolveReviewSnapshot(cwd, {
      from,
      includeUncommittedChanges: true,
    });
    expect(snapshot.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "D", path: "baseline-only.txt" }),
        expect.objectContaining({ status: "M", path: "visible-baseline.txt" }),
      ]),
    );
    const workspace = await materializeReviewWorkspace(snapshot);
    try {
      expect(() => readFileSync(join(workspace.cwd, "baseline-only.txt"))).toThrow();
      expect(readFileSync(join(workspace.cwd, "visible-baseline.txt"), "utf8")).toBe(
        "visible recreation\n",
      );
    } finally {
      await workspace.cleanup();
    }

    const outcome = await runReview({
      cwd,
      target: { from, includeUncommittedChanges: true },
      scope: { paths: ["baseline-only.txt"] },
      review: { tasks: [changeTask] },
      reviewerModel: model,
    });

    expect(outcome).toEqual({
      kind: "invalid",
      reason:
        'Review Scope path "baseline-only.txt" is ignored untracked content and is not in the frozen after state.',
    });
    expect(mocks.runReviewer).not.toHaveBeenCalled();
  });

  it("rejects deleted paths and canonicalizes surviving directory aliases", async () => {
    const directory = join(cwd, "src");
    mkdirSync(directory);
    writeFileSync(join(directory, "deleted.txt"), "delete\n");
    writeFileSync(join(directory, "kept.txt"), "keep\n");
    git(cwd, "add", "src");
    git(cwd, "commit", "-m", "add source files");
    unlinkSync(join(directory, "deleted.txt"));

    const deleted = await review(cwd, {}, { paths: ["src/deleted.txt"] });

    expect(deleted).toEqual({
      kind: "invalid",
      reason:
        'Review Scope path "src/deleted.txt" was deleted from the frozen after state. Select a surviving parent directory instead.',
    });
    expect(mocks.runReviewer).not.toHaveBeenCalled();

    const parent = await review(cwd, {}, { paths: ["src", "src/"] });

    expect(parent.kind).toBe("completed");
    if (parent.kind === "completed") expect(parent.details.scope).toEqual({ paths: ["src"] });
    expect(mocks.runReviewer).toHaveBeenCalledOnce();
  });

  it("normalizes duplicate scope paths once for every Reviewer Packet", async () => {
    let prompt = "";
    mocks.runReviewer.mockImplementationOnce(async (invocation) => {
      prompt = invocation.prompt;
      return {
        kind: "success",
        modelId: model.canonicalId,
        reviewerExtensionSetStatus: "active",
        value: { summary: "Done.", findings: [], criteriaCoverage: { status: "complete" } },
      };
    });

    const outcome = await review(cwd, {}, { paths: [" ./tracked.txt ", "tracked.txt"] });

    expect(outcome.kind).toBe("completed");
    if (outcome.kind === "completed") {
      expect(outcome.details.scope).toEqual({ paths: ["tracked.txt"] });
    }
    expect(prompt.match(/- "tracked\.txt"/g)).toHaveLength(1);
  });

  it.each([["/tmp/outside"], ["../outside"], ["."]])(
    "rejects an escaping scope path %j before a Reviewer Session starts",
    async (path) => {
      const outcome = await review(cwd, {}, { paths: [path] });

      expect(outcome.kind).not.toBe("completed");
      if (outcome.kind !== "completed") expect(outcome.reason).toMatch(/Review path must stay/i);
      expect(mocks.runReviewer).not.toHaveBeenCalled();
    },
  );
});
