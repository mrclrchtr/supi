import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveReviewSnapshot } from "../../src/git.ts";
import { materializeReviewWorkspace } from "../../src/workspace/review-workspace.ts";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function initializeRepository(cwd: string): void {
  git(cwd, "init");
  git(cwd, "config", "user.email", "test@example.com");
  git(cwd, "config", "user.name", "Test");
  git(cwd, "config", "commit.gpgsign", "false");
  git(cwd, "config", "core.hooksPath", "/dev/null");
  writeFileSync(join(cwd, "tracked.txt"), "base\n");
  git(cwd, "add", ".");
  git(cwd, "commit", "-m", "base");
}

describe("Review Workspace", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "supi-review-workspace-source-"));
    initializeRepository(cwd);
  });

  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  it("rejects a Working-Tree Review whose canonical patch changed before materialization", async () => {
    writeFileSync(join(cwd, "tracked.txt"), "initial target\n");
    const snapshot = await resolveReviewSnapshot(cwd, { kind: "working-tree" });
    expect(snapshot).toBeDefined();
    if (!snapshot) return;
    writeFileSync(join(cwd, "tracked.txt"), "changed target\n");

    await expect(materializeReviewWorkspace(snapshot)).rejects.toThrow(/target changed/i);
  });

  it("stages one frozen working-tree patch over its baseline and removes it after cleanup", async () => {
    writeFileSync(join(cwd, "tracked.txt"), "reviewed\n");
    writeFileSync(join(cwd, "untracked.txt"), "also reviewed\n");
    const snapshot = await resolveReviewSnapshot(cwd, { kind: "working-tree" });
    expect(snapshot).toBeDefined();
    if (!snapshot) return;

    const workspace = await materializeReviewWorkspace(snapshot);
    expect(workspace.receipt).toMatchObject({
      status: "verified",
      targetKind: "working-tree",
      expectedDiffHash: snapshot.diffHash,
      observedDiffHash: snapshot.diffHash,
      changedPathCount: 2,
    });
    expect(git(workspace.cwd, "diff", "--cached", "--name-only", "HEAD").split("\n")).toEqual([
      "tracked.txt",
      "untracked.txt",
    ]);
    expect(git(cwd, "worktree", "list", "--porcelain")).toContain(`worktree ${workspace.cwd}`);

    writeFileSync(join(cwd, "tracked.txt"), "changed after materialization\n");
    expect(git(workspace.cwd, "show", ":tracked.txt")).toBe("reviewed");

    await workspace.cleanup();
    expect(git(cwd, "worktree", "list", "--porcelain")).not.toContain(`worktree ${workspace.cwd}`);
  });

  it("verifies pinned comparison and commit workspaces before reviewers start", async () => {
    const base = git(cwd, "rev-parse", "HEAD");
    writeFileSync(join(cwd, "tracked.txt"), "committed target\n");
    git(cwd, "commit", "-am", "target");
    const target = git(cwd, "rev-parse", "HEAD");

    for (const spec of [
      { kind: "comparison" as const, baseCommit: base },
      { kind: "commit" as const, commit: target },
    ]) {
      const snapshot = await resolveReviewSnapshot(cwd, spec);
      expect(snapshot).toBeDefined();
      if (!snapshot) continue;
      const workspace = await materializeReviewWorkspace(snapshot);
      expect(workspace.receipt).toMatchObject({
        status: "verified",
        targetKind: spec.kind,
        expectedWorkspaceHead: target,
        observedWorkspaceHead: target,
        expectedDiffHash: snapshot.diffHash,
        observedDiffHash: snapshot.diffHash,
      });
      await workspace.cleanup();
    }
  });
});
