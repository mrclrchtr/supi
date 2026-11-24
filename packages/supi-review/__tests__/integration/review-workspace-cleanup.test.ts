import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveReviewSnapshot } from "../../src/git.ts";
import { materializeReviewWorkspace } from "../../src/workspace/review-workspace.ts";
import {
  listReviewWorkspaces,
  removeReviewWorkspace,
} from "../../src/workspace/review-workspace-cleanup.ts";
import { useRepositoryTemplate } from "../helpers/repository-template.ts";

// The global 2s timeout is too tight for tests spawning real git.
vi.setConfig({ testTimeout: 20000 });

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

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

describe("Review Workspace cleanup", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "supi-review-cleanup-source-"));
    initializeRepository(cwd);
  });

  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  it("lists only marked workspaces and removes a selected candidate", async () => {
    writeFileSync(join(cwd, "tracked.txt"), "reviewed\n");
    const snapshot = await resolveReviewSnapshot(cwd, {});
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

  it("marks new workspaces as Review-owned Agent Workspaces", async () => {
    writeFileSync(join(cwd, "tracked.txt"), "reviewed\n");
    const workspace = await materializeReviewWorkspace(await resolveReviewSnapshot(cwd, {}));
    try {
      expect(git(cwd, "worktree", "list", "--porcelain")).toContain(`locked supi-agent:review:`);
    } finally {
      await workspace.cleanup();
    }
  });

  it("still lists and removes a workspace with a legacy supi-review marker", async () => {
    const parent = realpathSync(mkdtempSync(join(tmpdir(), "supi-review-workspace-")));
    const legacy = join(parent, "workspace");
    git(cwd, "worktree", "add", "--detach", legacy, "HEAD");
    git(cwd, "worktree", "lock", "--reason", "supi-review:old;pid=999999999;started=t", legacy);

    const candidates = await listReviewWorkspaces(cwd);
    expect(candidates).toEqual([{ workspacePath: legacy, owner: "absent" }]);

    await expect(removeReviewWorkspace(cwd, candidates[0]!)).resolves.toEqual({
      workspacePath: legacy,
      removed: true,
    });
    expect(existsSync(parent)).toBe(false);
  });
});
