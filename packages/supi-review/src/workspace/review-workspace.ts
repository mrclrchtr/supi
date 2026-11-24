import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  AgentWorkspaceError,
  type AgentWorkspaceErrorCode,
  type AgentWorkspaceReceipt,
  createDisposableWorkspace,
  type DisposableAgentWorkspace,
} from "@mrclrchtr/supi-agent-runtime/workspace";
import { readReviewDiff } from "../git.ts";
import { runGit, runGitBuffer } from "../git-command.ts";
import { indexPatchLines, type ReviewTargetDiffFile } from "../target/diff.ts";
import type { ReviewSnapshot, ReviewWorkspaceReceipt } from "../types.ts";

const TARGET_DIFF_FILE = "target.diff";

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
  /** Present when the target has a before commit and at least one changed path. */
  targetDiff?: ReviewTargetDiffFile;
  cleanup(): Promise<ReviewWorkspaceCleanupWarning | undefined>;
}

function workspaceHead(snapshot: ReviewSnapshot): string {
  if (snapshot.target.includeUncommittedChanges) {
    if (!snapshot.target.fromCommit)
      throw new Error("Filesystem Review Target has no freeze base.");
    return snapshot.target.fromCommit;
  }
  return snapshot.target.toCommit;
}

function workspaceSnapshot(snapshot: ReviewSnapshot, cwd: string): ReviewSnapshot {
  return { ...snapshot, repositoryRoot: cwd };
}

/** Keep the Review-specific failure text that parent-facing results already show. */
const FREEZE_FAILURES: Partial<Record<AgentWorkspaceErrorCode, string>> = {
  "patch-mismatch": "The review target changed before its Review Workspace was frozen.",
  "unexpected-head": "Review Workspace checked out an unexpected commit.",
  "not-clean": "Review Workspace was not clean after checkout.",
  "hash-mismatch": "Review Workspace does not match the pinned target patch.",
};

function reviewFreezeError(error: unknown): unknown {
  if (!(error instanceof AgentWorkspaceError)) return error;
  const message = FREEZE_FAILURES[error.code];
  return message ? new Error(message) : error;
}

function reviewReceipt(
  snapshot: ReviewSnapshot,
  receipt: AgentWorkspaceReceipt,
): ReviewWorkspaceReceipt {
  return {
    status: "verified",
    ...(snapshot.target.fromCommit ? { fromCommit: snapshot.target.fromCommit } : {}),
    toCommit: snapshot.target.toCommit,
    includeUncommittedChanges: snapshot.target.includeUncommittedChanges,
    expectedWorkspaceHead: receipt.baseCommit,
    observedWorkspaceHead: receipt.observedHead,
    expectedDiffHash: receipt.expectedHash,
    observedDiffHash: receipt.observedHash,
    changedPathCount: snapshot.changes.length,
  };
}

/**
 * Save the target change as text beside the verified workspace and index where each path starts.
 * Binary changes appear as one `Binary files … differ` line instead of the canonical patch's
 * encoded blocks. Start lines are omitted when Git's path list does not match the headers.
 */
async function writeTargetDiff(
  snapshot: ReviewSnapshot,
  parent: string,
  cwd: string,
  signal?: AbortSignal,
): Promise<ReviewTargetDiffFile | undefined> {
  const { fromCommit, toCommit, includeUncommittedChanges } = snapshot.target;
  if (!fromCommit || snapshot.changes.length === 0) return undefined;
  const diff = ["diff", "--no-color", "--no-ext-diff", "--no-textconv"];
  const range = includeUncommittedChanges ? ["HEAD"] : [fromCommit, toCommit];
  const [patch, names] = await Promise.all([
    runGitBuffer(cwd, [...diff, ...range], undefined, signal),
    runGit(cwd, [...diff, "--name-only", "-z", ...range], undefined, signal),
  ]);
  await writeFile(join(parent, TARGET_DIFF_FILE), patch, { signal });
  const { lineCount, headerLines } = indexPatchLines(patch);
  const paths = names.split("\0").filter(Boolean);
  const startLines = new Map<string, number>();
  if (paths.length === headerLines.length) {
    for (const [position, path] of paths.entries()) {
      const line = headerLines[position];
      if (line !== undefined) startLines.set(path, line);
    }
  }
  return { path: `../${TARGET_DIFF_FILE}`, lineCount, startLines };
}

/**
 * Materialize one exact Review Snapshot as a disposable Agent Workspace.
 * Filesystem targets replay one already-hashed canonical patch over the exact
 * freeze base and stage it so each Reviewer Session sees the frozen after state.
 * Verification re-reads the workspace through the canonical patch compiler.
 */
export async function materializeReviewWorkspace(
  snapshot: ReviewSnapshot,
  signal?: AbortSignal,
): Promise<ReviewWorkspace> {
  signal?.throwIfAborted();
  const baseCommit = workspaceHead(snapshot);
  const patch = snapshot.target.includeUncommittedChanges
    ? await readReviewDiff(snapshot.repositoryRoot, snapshot, undefined, signal)
    : undefined;

  let workspace: DisposableAgentWorkspace;
  try {
    workspace = await createDisposableWorkspace({
      owner: "review",
      state: {
        repositoryRoot: snapshot.repositoryRoot,
        baseCommit,
        ...(patch ? { patch } : {}),
        expectedHash: snapshot.diffHash,
      },
      readPatch: (cwd, readSignal) =>
        readReviewDiff(cwd, workspaceSnapshot(snapshot, cwd), undefined, readSignal),
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    throw reviewFreezeError(error);
  }

  const { cwd } = workspace;
  let targetDiff: ReviewTargetDiffFile | undefined;
  try {
    targetDiff = await writeTargetDiff(snapshot, workspace.parentDirectory, cwd, signal);
  } catch (error) {
    await workspace.release();
    throw error;
  }

  return {
    cwd,
    receipt: reviewReceipt(snapshot, workspace.receipt),
    ...(targetDiff ? { targetDiff } : {}),
    async cleanup() {
      const failure = await workspace.release();
      if (!failure) return undefined;
      return {
        workspacePath: failure.workspacePath,
        // /supi-agent-cleanup leaves workspaces of a running owner alone, so it applies only
        // after this Pi session ends; the recovery command works immediately.
        message:
          "Review Workspace cleanup failed; completed review findings remain valid. Run the recovery command now, or /supi-agent-cleanup after this Pi session ends.",
        recoveryCommand: failure.recoveryCommand,
      };
    },
  };
}
