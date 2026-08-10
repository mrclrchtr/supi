import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveReviewSnapshot } from "../../src/git.ts";
import { materializeReviewWorkspace } from "../../src/workspace/review-workspace.ts";

vi.setConfig({ testTimeout: 20_000 });

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

describe("Review Workspace materialization", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "supi-review-workspace-source-"));
    initializeRepository(cwd);
  });

  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  it("rejects a filesystem target whose canonical patch changed before materialization", async () => {
    writeFileSync(join(cwd, "tracked.txt"), "initial target\n");
    const snapshot = await resolveReviewSnapshot(cwd, {});
    writeFileSync(join(cwd, "tracked.txt"), "changed target\n");

    await expect(materializeReviewWorkspace(snapshot)).rejects.toThrow(/target changed/i);
  });

  it("stages one frozen filesystem patch over the exact from commit", async () => {
    const from = git(cwd, "rev-parse", "HEAD");
    writeFileSync(join(cwd, "tracked.txt"), "committed\n");
    git(cwd, "commit", "-am", "intermediate");
    const to = git(cwd, "rev-parse", "HEAD");
    writeFileSync(join(cwd, "tracked.txt"), "reviewed\n");
    writeFileSync(join(cwd, "untracked.txt"), "also reviewed\n");
    const snapshot = await resolveReviewSnapshot(cwd, { from });

    const workspace = await materializeReviewWorkspace(snapshot);

    expect(workspace.receipt).toMatchObject({
      status: "verified",
      fromCommit: from,
      toCommit: to,
      includeUncommittedChanges: true,
      expectedWorkspaceHead: from,
      observedWorkspaceHead: from,
      expectedDiffHash: snapshot.diffHash,
      observedDiffHash: snapshot.diffHash,
      changedPathCount: 2,
    });
    expect(git(workspace.cwd, "diff", "--cached", "--name-only", "HEAD").split("\n")).toEqual([
      "tracked.txt",
      "untracked.txt",
    ]);
    expect(readFileSync(join(workspace.cwd, "untracked.txt"), "utf8")).toBe("also reviewed\n");
    await workspace.cleanup();
  });

  it("checks out an exact committed after state without staged freeze data", async () => {
    const from = git(cwd, "rev-parse", "HEAD");
    writeFileSync(join(cwd, "tracked.txt"), "committed\n");
    git(cwd, "commit", "-am", "target");
    const to = git(cwd, "rev-parse", "HEAD");
    const snapshot = await resolveReviewSnapshot(cwd, {
      from,
      to,
      includeUncommittedChanges: false,
    });

    const workspace = await materializeReviewWorkspace(snapshot);

    expect(workspace.receipt).toMatchObject({
      fromCommit: from,
      toCommit: to,
      includeUncommittedChanges: false,
      expectedWorkspaceHead: to,
      observedWorkspaceHead: to,
    });
    expect(git(workspace.cwd, "status", "--porcelain")).toBe("");
    expect(readFileSync(join(workspace.cwd, "tracked.txt"), "utf8")).toBe("committed\n");
    await workspace.cleanup();
  });
});
