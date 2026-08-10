import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { readReviewDiff } from "../git.ts";
import { runGit, runGitAllowExit } from "../git-command.ts";
import type { ReviewSnapshot, ReviewWorkspaceReceipt } from "../types.ts";

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
  receipt: ReviewWorkspaceReceipt;
  cleanup(): Promise<ReviewWorkspaceCleanupWarning | undefined>;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function workspaceHead(snapshot: ReviewSnapshot): string {
  if (snapshot.target.includeUncommittedChanges) {
    if (!snapshot.target.fromCommit)
      throw new Error("Filesystem Review Target has no freeze base.");
    return snapshot.target.fromCommit;
  }
  return snapshot.target.toCommit;
}

function lockReason(): string {
  return `${WORKSPACE_MARKER}${randomUUID()};pid=${process.pid};started=${new Date().toISOString()}`;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"")}'`;
}

function workspaceSnapshot(snapshot: ReviewSnapshot, cwd: string): ReviewSnapshot {
  return { ...snapshot, repositoryRoot: cwd };
}

/** Re-read the frozen workspace through the canonical patch compiler before children can inspect it. */
async function verifyWorkspace(
  snapshot: ReviewSnapshot,
  cwd: string,
  signal?: AbortSignal,
): Promise<ReviewWorkspaceReceipt> {
  const expectedWorkspaceHead = workspaceHead(snapshot);
  const observedWorkspaceHead = (
    await runGit(
      cwd,
      [
        "rev-parse",
        "--verify",
        // biome-ignore lint/security/noSecrets: Git revision syntax, not a secret
        "HEAD^{commit}",
      ],
      undefined,
      signal,
    )
  ).trim();
  if (observedWorkspaceHead !== expectedWorkspaceHead) {
    throw new Error("Review Workspace checked out an unexpected commit.");
  }
  if (!snapshot.target.includeUncommittedChanges) {
    const status = await runGit(cwd, ["status", "--porcelain"], undefined, signal);
    if (status) throw new Error("Review Workspace was not clean after checkout.");
  }
  const observedDiffHash = sha256(
    await readReviewDiff(cwd, workspaceSnapshot(snapshot, cwd), undefined, signal),
  );
  if (observedDiffHash !== snapshot.diffHash) {
    throw new Error("Review Workspace does not match the pinned target patch.");
  }
  return {
    status: "verified",
    ...(snapshot.target.fromCommit ? { fromCommit: snapshot.target.fromCommit } : {}),
    toCommit: snapshot.target.toCommit,
    includeUncommittedChanges: snapshot.target.includeUncommittedChanges,
    expectedWorkspaceHead,
    observedWorkspaceHead,
    expectedDiffHash: snapshot.diffHash,
    observedDiffHash,
    changedPathCount: snapshot.changes.length,
  };
}

/**
 * Materialize one exact Review Snapshot as a disposable linked worktree.
 * Filesystem targets replay one already-hashed canonical patch over the exact
 * freeze base and stage it so each Reviewer Session sees the frozen after state.
 */
export async function materializeReviewWorkspace(
  snapshot: ReviewSnapshot,
  signal?: AbortSignal,
): Promise<ReviewWorkspace> {
  signal?.throwIfAborted();
  const parent = await mkdtemp(join(tmpdir(), "supi-review-workspace-"));
  const workspacePath = join(parent, "workspace");
  let cwd = workspacePath;
  let created = false;
  let receipt: ReviewWorkspaceReceipt | undefined;

  try {
    await runGit(
      snapshot.repositoryRoot,
      ["worktree", "add", "--detach", workspacePath, workspaceHead(snapshot)],
      undefined,
      signal,
    );
    created = true;
    cwd = await realpath(workspacePath);
    await runGit(
      snapshot.repositoryRoot,
      ["worktree", "lock", "--reason", lockReason(), cwd],
      undefined,
      signal,
    );

    if (snapshot.target.includeUncommittedChanges) {
      const patch = await readReviewDiff(snapshot.repositoryRoot, snapshot, undefined, signal);
      if (sha256(patch) !== snapshot.diffHash) {
        throw new Error("The review target changed before its Review Workspace was frozen.");
      }
      if (patch) {
        const patchPath = join(parent, "target.patch");
        await writeFile(patchPath, patch, { encoding: "utf8", signal });
        await runGit(
          cwd,
          ["apply", "--index", "--binary", "--whitespace=nowarn", patchPath],
          undefined,
          signal,
        );
      }
    }
    receipt = await verifyWorkspace(snapshot, cwd, signal);
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

  if (!receipt) throw new Error("Review Workspace verification did not complete.");
  let cleaned = false;
  return {
    cwd,
    receipt,
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
