import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveReviewSnapshot } from "../../src/git.ts";
import { materializeReviewWorkspace } from "../../src/workspace/review-workspace.ts";
import {
  listReviewWorkspaces,
  removeReviewWorkspace,
} from "../../src/workspace/review-workspace-cleanup.ts";

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

describe("Review Workspace cleanup", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "supi-review-cleanup-source-"));
    initializeRepository(cwd);
  });

  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  it("lists only marked workspaces and removes a selected candidate", async () => {
    writeFileSync(join(cwd, "tracked.txt"), "reviewed\n");
    const snapshot = await resolveReviewSnapshot(cwd, { kind: "working-tree" });
    expect(snapshot).toBeDefined();
    if (!snapshot) return;
    const workspace = await materializeReviewWorkspace(snapshot);

    const candidates = await listReviewWorkspaces(cwd);
    expect(candidates).toEqual([
      expect.objectContaining({ workspacePath: workspace.cwd, owner: "active" }),
    ]);

    await expect(removeReviewWorkspace(cwd, candidates[0]!)).resolves.toEqual({
      workspacePath: workspace.cwd,
      removed: true,
    });
    expect(await listReviewWorkspaces(cwd)).toEqual([]);
    expect(existsSync(dirname(workspace.cwd))).toBe(false);
  });
});
