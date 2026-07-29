import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { readReviewDiff } from "../git.ts";
import { runGit, runGitAllowExit } from "../git-command.ts";
import type { ReviewSnapshot } from "../types.ts";

const WORKSPACE_MARKER = "supi-review:";

/** Parent-facing warning retained when a disposable Review Workspace cannot be removed. */
export interface ReviewWorkspaceCleanupWarning {
  workspacePath: string;
  message: string;
  recoveryCommand: string;
}

/** A materialized, registered Git worktree for one review batch. */
export interface ReviewWorkspace {
  cwd: string;
  cleanup(): Promise<ReviewWorkspaceCleanupWarning | undefined>;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function afterCommit(snapshot: ReviewSnapshot): string {
  if (snapshot.target.kind === "working-tree") {
    return snapshot.target.mergeBaseCommit ?? snapshot.target.headCommit;
  }
  return snapshot.target.kind === "comparison"
    ? snapshot.target.headCommit
    : snapshot.target.commit;
}

function lockReason(): string {
  return `${WORKSPACE_MARKER}${randomUUID()};pid=${process.pid};started=${new Date().toISOString()}`;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"")}'`;
}

/**
 * Materialize one exact Review Snapshot as a disposable linked worktree.
 * Working-tree targets replay the already-hashed canonical patch over their
 * pinned baseline and stage it so `git diff HEAD` exposes the full after-state.
 */
export async function materializeReviewWorkspace(
  snapshot: ReviewSnapshot,
): Promise<ReviewWorkspace> {
  const parent = await mkdtemp(join(tmpdir(), "supi-review-workspace-"));
  const workspacePath = join(parent, "workspace");
  let cwd = workspacePath;
  let created = false;

  try {
    await runGit(snapshot.repositoryRoot, [
      "worktree",
      "add",
      "--detach",
      workspacePath,
      afterCommit(snapshot),
    ]);
    created = true;
    cwd = await realpath(workspacePath);
    await runGit(snapshot.repositoryRoot, ["worktree", "lock", "--reason", lockReason(), cwd]);

    if (snapshot.target.kind === "working-tree") {
      const patch = await readReviewDiff(snapshot.repositoryRoot, snapshot);
      if (sha256(patch) !== snapshot.diffHash) {
        throw new Error("The working-tree target changed before its Review Workspace was frozen.");
      }
      const patchPath = join(parent, "target.patch");
      await writeFile(patchPath, patch, "utf8");
      await runGit(cwd, ["apply", "--index", "--binary", "--whitespace=nowarn", patchPath]);
    }
  } catch (error) {
    if (created) {
      await runGitAllowExit(snapshot.repositoryRoot, ["worktree", "unlock", cwd], [128]).catch(
        () => undefined,
      );
      await runGitAllowExit(
        snapshot.repositoryRoot,
        ["worktree", "remove", "--force", cwd],
        [128],
      ).catch(() => undefined);
    }
    await rm(parent, { recursive: true, force: true });
    throw error;
  }

  let cleaned = false;
  return {
    cwd,
    async cleanup() {
      if (cleaned) return undefined;
      cleaned = true;
      try {
        await runGitAllowExit(snapshot.repositoryRoot, ["worktree", "unlock", cwd], [128]);
        await runGit(snapshot.repositoryRoot, ["worktree", "remove", "--force", cwd]);
        await rm(parent, { recursive: true, force: true });
        return undefined;
      } catch {
        return {
          workspacePath: cwd,
          message: "Review Workspace cleanup failed; completed review findings remain valid.",
          recoveryCommand: `git worktree remove --force ${shellQuote(cwd)} && rm -rf ${shellQuote(dirname(cwd))}`,
        };
      }
    },
  };
}

/** Stable marker prefix used to identify Review Workspaces in Git's worktree inventory. */
export const REVIEW_WORKSPACE_MARKER = WORKSPACE_MARKER;
