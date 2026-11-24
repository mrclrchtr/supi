import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { listAgentWorkspaces, removeAgentWorkspace } from "@mrclrchtr/supi-agent-runtime/workspace";
import { useRepositoryTemplate } from "@mrclrchtr/supi-test-utils/git";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveReviewSnapshot } from "../../src/git.ts";
import { materializeReviewWorkspace } from "../../src/workspace/review-workspace.ts";

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

  it("leaves an interrupted Review Workspace removable by Agent Workspace cleanup", async () => {
    writeFileSync(join(cwd, "tracked.txt"), "reviewed\n");
    const snapshot = await resolveReviewSnapshot(cwd, {});
    expect(snapshot).toBeDefined();
    if (!snapshot) return;
    const workspace = await materializeReviewWorkspace(snapshot);

    expect(await listAgentWorkspaces(cwd)).toEqual([
      expect.objectContaining({
        path: workspace.cwd,
        owner: "review",
        ownerStatus: "active",
        disposable: true,
      }),
    ]);

    await expect(removeAgentWorkspace(cwd, workspace.cwd)).resolves.toEqual({
      path: workspace.cwd,
      outcome: "removed",
    });
    expect(await listAgentWorkspaces(cwd)).toEqual([]);
    expect(existsSync(dirname(workspace.cwd))).toBe(false);
  });

  it("points a failed cleanup to /supi-agent-cleanup and a manual recovery command", async () => {
    writeFileSync(join(cwd, "tracked.txt"), "reviewed\n");
    const workspace = await materializeReviewWorkspace(await resolveReviewSnapshot(cwd, {}));
    // A read-only workspace directory makes `git worktree remove` fail.
    chmodSync(workspace.cwd, 0o555);
    try {
      const warning = await workspace.cleanup();
      expect(warning?.workspacePath).toBe(workspace.cwd);
      expect(warning?.message).toContain("/supi-agent-cleanup");
      expect(warning?.recoveryCommand).toContain("git worktree remove --force");
    } finally {
      chmodSync(workspace.cwd, 0o755);
      rmSync(dirname(workspace.cwd), { recursive: true, force: true });
      git(cwd, "worktree", "prune");
    }
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
});
