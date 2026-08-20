import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  afterSnapshotResolution: undefined as (() => void) | undefined,
  runReviewer: vi.fn(),
}));
vi.mock("../../src/git.ts", async (original) => {
  const actual = await original<typeof import("../../src/git.ts")>();
  return {
    ...actual,
    resolveReviewSnapshot: async (...args: Parameters<typeof actual.resolveReviewSnapshot>) => {
      const snapshot = await actual.resolveReviewSnapshot(...args);
      mocks.afterSnapshotResolution?.();
      return snapshot;
    },
  };
});
vi.mock("../../src/tool/review_run/runner.ts", () => ({ runReviewer: mocks.runReviewer }));

import { isRootCommit, resolveReviewSnapshot } from "../../src/git.ts";
import { runReview } from "../../src/tool/review_run/workflow.ts";
import type { ReviewModelSelection, ReviewTask } from "../../src/types.ts";

vi.setConfig({ testTimeout: 20_000 });

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
const changeTask: ReviewTask = { id: "change", instructions: "Review the change.", mode: "change" };
const stateTask: ReviewTask = { id: "state", instructions: "Review the state.", mode: "state" };

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

function review(
  cwd: string,
  target: Parameters<typeof runReview>[0]["target"],
  tasks: ReviewTask[],
) {
  return runReview({ cwd, target, review: { tasks }, reviewerModel: model });
}

describe("runReview exact Review Target workflow", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "supi-review-workflow-"));
    initializeRepository(cwd);
    mocks.afterSnapshotResolution = undefined;
    mocks.runReviewer.mockReset();
    successfulReviewer();
  });

  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  it("resolves branch, hash, ~, ^, and peeled tags to exact endpoint commits", async () => {
    const base = git(cwd, "rev-parse", "HEAD");
    git(cwd, "branch", "review-base", base);
    git(cwd, "tag", "-a", "annotated-base", "-m", "base tag", base);
    writeFileSync(join(cwd, "tracked.txt"), "tip\n");
    git(cwd, "commit", "-am", "tip");
    const tip = git(cwd, "rev-parse", "HEAD");
    git(cwd, "branch", "review-tip", tip);
    git(cwd, "tag", "light-tip", tip);

    for (const target of [
      { from: base.slice(0, 12), to: "review-tip", includeUncommittedChanges: false },
      { from: "HEAD^", to: "light-tip", includeUncommittedChanges: false },
      { from: "HEAD~1", to: "HEAD", includeUncommittedChanges: false },
      { from: "annotated-base", to: tip, includeUncommittedChanges: false },
      { from: base, includeUncommittedChanges: false },
    ]) {
      const outcome = await review(cwd, target, [changeTask]);
      expect(outcome.kind).toBe("completed");
      if (outcome.kind !== "completed") continue;
      expect(outcome.details.snapshot.target).toEqual({
        fromCommit: base,
        toCommit: tip,
        includeUncommittedChanges: false,
      });
      expect(outcome.details.workspaceReceipt).toMatchObject({
        fromCommit: base,
        toCommit: tip,
        includeUncommittedChanges: false,
        expectedWorkspaceHead: tip,
        observedWorkspaceHead: tip,
      });
    }
  });

  it("rejects blank, range, tree, and blob endpoint syntax", async () => {
    const tree = git(cwd, "rev-parse", "HEAD^{tree}");
    const blob = git(cwd, "rev-parse", "HEAD:tracked.txt");
    for (const from of [
      "  ",
      "HEAD~1..HEAD",
      "HEAD...HEAD",
      "HEAD^@",
      "HEAD^!",
      "HEAD^-",
      tree,
      blob,
    ]) {
      const outcome = await review(cwd, { from, to: "HEAD", includeUncommittedChanges: false }, [
        changeTask,
      ]);
      expect(outcome.kind).toBe("no-target");
      if (outcome.kind === "no-target") expect(outcome.reason).toMatch(/blank|range|commit/i);
    }
    for (const [from, reason] of [
      ["^HEAD", /range/i],
      ["HEAD ^", /whitespace/i],
    ] as const) {
      const outcome = await review(cwd, { from, to: "HEAD", includeUncommittedChanges: false }, [
        changeTask,
      ]);
      expect(outcome).toMatchObject({ kind: "no-target", reason: expect.stringMatching(reason) });
    }
    expect(mocks.runReviewer).not.toHaveBeenCalled();
  });

  it("rejects removed runtime input fields before workspace creation", async () => {
    const before = git(cwd, "worktree", "list", "--porcelain");
    const inputs = [
      {
        target: { kind: "current-state" },
        review: { tasks: [stateTask] },
        reason: /Review Target field kind is not supported/i,
      },
      {
        target: {},
        review: { tasks: [stateTask], prepared: {} },
        reason: /Review input field prepared is not supported/i,
      },
      {
        target: {},
        review: {
          tasks: [{ ...stateTask, findingScope: "criteria-only" }],
        },
        reason: /Review Task field findingScope is not supported/i,
      },
      {
        target: {},
        review: { tasks: [{}] },
        reason: /Review Task id must be a string/i,
      },
      {
        target: {},
        review: { tasks: [{ ...stateTask, instructions: 42 }] },
        reason: /Review Task instructions must be a string/i,
      },
      {
        target: {},
        review: { sharedContext: 42, tasks: [stateTask] },
        reason: /Shared review context must be a string/i,
      },
      {
        target: {},
        review: { tasks: [{ ...stateTask, criteriaSources: {} }] },
        reason: /criteria sources must be an array/i,
      },
    ];

    for (const input of inputs) {
      const outcome = await runReview({
        cwd,
        target: input.target as never,
        review: input.review as never,
        reviewerModel: model,
      });
      expect(outcome).toMatchObject({
        kind: "no-target",
        reason: expect.stringMatching(input.reason),
      });
    }
    expect(git(cwd, "worktree", "list", "--porcelain")).toBe(before);
    expect(mocks.runReviewer).not.toHaveBeenCalled();
  });

  it("rejects target and task cross-field conflicts before workspace creation", async () => {
    const before = git(cwd, "worktree", "list", "--porcelain");
    const inputs = [
      { target: { to: "HEAD" }, tasks: [changeTask], reason: /includeUncommittedChanges/i },
      {
        target: { includeUncommittedChanges: false },
        tasks: [changeTask],
        reason: /explicit from/i,
      },
      { target: { from: "HEAD" }, tasks: [stateTask], reason: /all-state/i },
    ];

    for (const input of inputs) {
      const outcome = await review(cwd, input.target, input.tasks);
      expect(outcome.kind).not.toBe("completed");
      if (outcome.kind !== "completed") expect(outcome.reason).toMatch(input.reason);
    }
    expect(git(cwd, "worktree", "list", "--porcelain")).toBe(before);
    expect(mocks.runReviewer).not.toHaveBeenCalled();
  });

  it("uses captured HEAD as the local change before commit and freezes non-ignored untracked files", async () => {
    writeFileSync(join(cwd, ".gitignore"), "ignored.txt\n");
    git(cwd, "add", ".gitignore");
    git(cwd, "commit", "-m", "ignore fixture");
    const base = git(cwd, "rev-parse", "HEAD");
    writeFileSync(join(cwd, "tracked.txt"), "filesystem\n");
    writeFileSync(join(cwd, "untracked.txt"), "untracked\n");
    writeFileSync(join(cwd, "ignored.txt"), "ignored\n");
    let reviewerCwd = "";
    mocks.runReviewer.mockImplementationOnce(async (invocation) => {
      reviewerCwd = invocation.cwd;
      expect(git(invocation.cwd, "rev-parse", "HEAD")).toBe(base);
      expect(git(invocation.cwd, "diff", "--cached", "--name-only", "HEAD").split("\n")).toEqual([
        "tracked.txt",
        "untracked.txt",
      ]);
      expect(readFileSync(join(invocation.cwd, "untracked.txt"), "utf8")).toBe("untracked\n");
      expect(() => readFileSync(join(invocation.cwd, "ignored.txt"))).toThrow();
      return {
        kind: "success",
        modelId: model.canonicalId,
        reviewerExtensionSetStatus: "active",
        value: { summary: "Done.", findings: [], criteriaCoverage: { status: "complete" } },
      };
    });

    const outcome = await review(cwd, {}, [changeTask]);

    expect(outcome.kind).toBe("completed");
    if (outcome.kind !== "completed") return;
    expect(outcome.details.snapshot.target).toEqual({
      fromCommit: base,
      toCommit: base,
      includeUncommittedChanges: true,
    });
    expect(outcome.details.workspaceReceipt).toMatchObject({
      fromCommit: base,
      toCommit: base,
      includeUncommittedChanges: true,
      expectedWorkspaceHead: base,
      observedWorkspaceHead: base,
      changedPathCount: 2,
    });
    expect(reviewerCwd).not.toBe(cwd);
  });

  it("rejects a full batch with an empty change before workspace creation and permits empty state", async () => {
    const before = git(cwd, "worktree", "list", "--porcelain");
    const emptyChange = await review(cwd, {}, [changeTask]);
    expect(emptyChange).toEqual({
      kind: "invalid",
      reason: "Every change Review Task requires a non-empty canonical change.",
    });
    expect(git(cwd, "worktree", "list", "--porcelain")).toBe(before);
    expect(mocks.runReviewer).not.toHaveBeenCalled();

    const emptyState = await review(cwd, {}, [stateTask]);
    expect(emptyState.kind).toBe("completed");
    if (emptyState.kind !== "completed") return;
    expect(emptyState.details.workspaceReceipt.changedPathCount).toBe(0);
    expect(emptyState.details.results[0]).toMatchObject({ mode: "state", status: "completed" });
  });

  it("uses an after-state title for an all-state current filesystem batch", async () => {
    const head = git(cwd, "rev-parse", "HEAD");
    writeFileSync(join(cwd, "tracked.txt"), "filesystem state\n");
    const updateTitles: string[] = [];
    let packet = "";
    mocks.runReviewer.mockImplementationOnce(async (invocation) => {
      packet = invocation.prompt;
      return {
        kind: "success",
        modelId: model.canonicalId,
        reviewerExtensionSetStatus: "active",
        value: { summary: "Done.", findings: [], criteriaCoverage: { status: "complete" } },
      };
    });

    const outcome = await runReview({
      cwd,
      target: {},
      review: { tasks: [stateTask] },
      reviewerModel: model,
      onUpdate: (update) => {
        if (update.details.targetTitle) updateTitles.push(update.details.targetTitle);
      },
    });

    expect(outcome.kind).toBe("completed");
    if (outcome.kind !== "completed") return;
    expect(outcome.details.snapshot.title).toBe("Current filesystem");
    expect(updateTitles).toContain("Current filesystem");
    expect(packet).toContain(`Target: Frozen current filesystem after HEAD ${head}`);
    expect(packet).not.toContain("Filesystem changes");
  });

  it("allows state Review Mode at a root commit but rejects root as a committed change after endpoint", async () => {
    const root = git(cwd, "rev-parse", "HEAD");
    const state = await review(cwd, { to: root, includeUncommittedChanges: false }, [stateTask]);
    expect(state.kind).toBe("completed");
    if (state.kind === "completed") {
      expect(state.details.workspaceReceipt).toMatchObject({
        toCommit: root,
        includeUncommittedChanges: false,
        expectedWorkspaceHead: root,
      });
    }

    const change = await review(cwd, { from: root, to: root, includeUncommittedChanges: false }, [
      changeTask,
    ]);
    expect(change).toEqual({
      kind: "invalid",
      reason: "A committed change Review Target cannot use a root commit as to.",
    });
  });

  it("recognizes a root commit when its message contains a parent header", async () => {
    git(cwd, "commit", "--amend", "-m", `parent ${"a".repeat(40)}`);

    expect(await isRootCommit(cwd, git(cwd, "rev-parse", "HEAD"))).toBe(true);
  });

  it("accepts a root commit as an explicit change before endpoint", async () => {
    const root = git(cwd, "rev-parse", "HEAD");
    writeFileSync(join(cwd, "tracked.txt"), "later\n");
    git(cwd, "commit", "-am", "later");
    const later = git(cwd, "rev-parse", "HEAD");

    const outcome = await review(cwd, { from: root, to: later, includeUncommittedChanges: false }, [
      changeTask,
    ]);

    expect(outcome.kind).toBe("completed");
  });

  it("fails every Review when the repository has no HEAD", async () => {
    const unborn = mkdtempSync(join(tmpdir(), "supi-review-unborn-"));
    try {
      git(unborn, "init");
      const outcome = await review(unborn, {}, [stateTask]);
      expect(outcome).toEqual({
        kind: "no-target",
        reason: "No HEAD commit found in this repository.",
      });
    } finally {
      rmSync(unborn, { recursive: true, force: true });
    }
  });

  it("uses divergent exact commits from a caller subdirectory", async () => {
    const base = git(cwd, "rev-parse", "HEAD");
    git(cwd, "checkout", "-b", "left");
    writeFileSync(join(cwd, "tracked.txt"), "left\n");
    git(cwd, "commit", "-am", "left");
    const left = git(cwd, "rev-parse", "HEAD");
    git(cwd, "checkout", "-b", "right", base);
    writeFileSync(join(cwd, "tracked.txt"), "right\n");
    git(cwd, "commit", "-am", "right");
    const right = git(cwd, "rev-parse", "HEAD");
    git(cwd, "checkout", "left");
    const nested = join(cwd, "packages", "child");
    mkdirSync(nested, { recursive: true });

    mocks.runReviewer.mockImplementationOnce(async (invocation) => {
      expect(git(invocation.cwd, "rev-parse", "HEAD")).toBe(right);
      expect(readFileSync(join(invocation.cwd, "tracked.txt"), "utf8")).toBe("right\n");
      return {
        kind: "success",
        modelId: model.canonicalId,
        reviewerExtensionSetStatus: "active",
        value: { summary: "Done.", findings: [], criteriaCoverage: { status: "complete" } },
      };
    });

    const outcome = await review(
      nested,
      { from: left, to: right, includeUncommittedChanges: false },
      [changeTask],
    );

    expect(outcome.kind).toBe("completed");
    if (outcome.kind === "completed") {
      expect(outcome.details.snapshot.target).toEqual({
        fromCommit: left,
        toCommit: right,
        includeUncommittedChanges: false,
      });
    }
  });

  it("freezes filesystem file-to-directory transitions and binary content", async () => {
    writeFileSync(join(cwd, "shape"), "file\n");
    git(cwd, "add", "shape");
    git(cwd, "commit", "-m", "file shape");
    unlinkSync(join(cwd, "shape"));
    mkdirSync(join(cwd, "shape"));
    writeFileSync(join(cwd, "shape", "child.txt"), "directory\n");
    const binary = Buffer.from([0, 1, 2, 3]);
    writeFileSync(join(cwd, "asset.bin"), binary);

    mocks.runReviewer.mockImplementationOnce(async (invocation) => {
      expect(statSync(join(invocation.cwd, "shape")).isDirectory()).toBe(true);
      expect(readFileSync(join(invocation.cwd, "shape", "child.txt"), "utf8")).toBe("directory\n");
      expect(readFileSync(join(invocation.cwd, "asset.bin"))).toEqual(binary);
      return {
        kind: "success",
        modelId: model.canonicalId,
        reviewerExtensionSetStatus: "active",
        value: { summary: "Done.", findings: [], criteriaCoverage: { status: "complete" } },
      };
    });

    const outcome = await review(cwd, {}, [changeTask]);

    expect(outcome.kind).toBe("completed");
    if (outcome.kind === "completed") {
      expect(outcome.details.snapshot.changes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ status: "D", path: "shape" }),
          expect.objectContaining({ status: "A", path: "shape/child.txt" }),
          { status: "A", path: "asset.bin", additions: null, deletions: null },
        ]),
      );
    }
  });

  it("rejects a filesystem change made between final and captured target resolution", async () => {
    const base = git(cwd, "rev-parse", "HEAD");
    writeFileSync(join(cwd, "tracked.txt"), "captured\n");
    const captured = await resolveReviewSnapshot(cwd, {
      from: base,
      includeUncommittedChanges: true,
    });
    mocks.afterSnapshotResolution = () => {
      mocks.afterSnapshotResolution = undefined;
      writeFileSync(join(cwd, "tracked.txt"), "newer\n");
    };

    const outcome = await runReview({
      cwd,
      target: { includeUncommittedChanges: true },
      review: { tasks: [stateTask] },
      reviewerModel: model,
      expectedSnapshot: captured,
      expectedSnapshotTarget: { from: base, includeUncommittedChanges: true },
    });

    expect(outcome).toEqual({
      kind: "invalid",
      reason: "The review target changed while tasks were edited. Start a new review.",
    });
    expect(readFileSync(join(cwd, "tracked.txt"), "utf8")).toBe("newer\n");
    expect(mocks.runReviewer).not.toHaveBeenCalled();
  });

  it("maps recovery provenance without changing the original task model or verdict rules", async () => {
    writeFileSync(join(cwd, "tracked.txt"), "changed\n");
    mocks.runReviewer.mockResolvedValueOnce({
      kind: "failed",
      failureCode: "missing-structured-output",
      diagnostics: { lifecycleTrace: { entries: [], droppedCount: 0 }, turns: 2, toolUses: 1 },
      modelId: model.canonicalId,
      reviewerExtensionSetStatus: "active",
      submissionRecovery: {
        status: "exhausted",
        attempts: [
          { modelId: model.canonicalId, outcome: "no-terminal-output" },
          { modelId: "other/recovery", outcome: "model-switch-failed" },
        ],
      },
    });

    const outcome = await runReview({
      cwd,
      target: {},
      review: { tasks: [changeTask] },
      reviewerModel: model,
      recoveryModelId: "other/recovery",
    });

    expect(outcome.kind).toBe("completed");
    if (outcome.kind !== "completed") return;
    expect(outcome.details.results[0]).toMatchObject({
      status: "failed",
      modelId: model.canonicalId,
      packetHash: expect.any(String),
      submissionRecovery: {
        status: "exhausted",
        attempts: [
          { modelId: model.canonicalId, outcome: "no-terminal-output" },
          { modelId: "other/recovery", outcome: "model-switch-failed" },
        ],
      },
    });
    expect(outcome.details.results[0]).not.toHaveProperty("verdict");
    expect(mocks.runReviewer).toHaveBeenCalledWith(
      expect.objectContaining({ recoveryModelId: "other/recovery" }),
    );
  });

  it("runs mixed modes in one non-empty workspace with mode-specific packets", async () => {
    const base = git(cwd, "rev-parse", "HEAD");
    writeFileSync(join(cwd, "tracked.txt"), "changed\n");
    const packets: Record<string, string> = {};
    const workspaces = new Set<string>();
    mocks.runReviewer.mockImplementation(async (invocation) => {
      packets[invocation.task.id] = invocation.prompt;
      workspaces.add(invocation.cwd);
      return {
        kind: "success",
        modelId: model.canonicalId,
        reviewerExtensionSetStatus: "active",
        value: { summary: "Done.", findings: [], criteriaCoverage: { status: "complete" } },
      };
    });

    const outcome = await review(cwd, {}, [changeTask, stateTask]);

    expect(outcome.kind).toBe("completed");
    if (outcome.kind !== "completed") return;
    expect([...workspaces]).toHaveLength(1);
    expect(packets.change).toContain(`Before state: exact commit ${base}.`);
    expect(packets.change).toContain("## Changed files");
    expect(packets.change).toContain("Target diff SHA-256:");
    expect(packets.state).toContain("Review Mode: state");
    expect(packets.state).toContain("staged changes are freeze mechanics, not Target Evidence");
    expect(packets.state).not.toContain("## Changed files");
    expect(packets.state).not.toContain("Target diff SHA-256:");
    expect(outcome.details.results.map((result) => result.mode)).toEqual(["change", "state"]);
  });
});
