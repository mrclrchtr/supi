import { runGit, runGitAllowFatal } from "./git.ts";
import {
  createAgentWorkspaceMarker,
  markerOwnerStatus,
  parseAgentWorkspaceMarker,
} from "./marker.ts";
import { AgentWorkspaceError, type AgentWorkspaceOwner } from "./types.ts";
import { describeWorktree, listWorktrees, type WorktreeRecord } from "./worktrees.ts";

/** An exclusive `git worktree lock` on an existing caller-provided linked worktree. */
export interface WorktreeLease {
  /** Canonical worktree root that is locked. */
  root: string;
  /** Lock reason written for this lease. */
  marker: string;
  /**
   * Unlock the worktree when it still carries this lease's marker. Never removes the worktree.
   * Idempotent.
   */
  release(): Promise<void>;
}

/** Input for {@link acquireWorktreeLease}. */
export interface AcquireWorktreeLeaseOptions {
  /** Any directory inside the linked worktree. */
  cwd: string;
  owner: AgentWorkspaceOwner;
  signal?: AbortSignal;
}

function lockedError(root: string, reason: string): AgentWorkspaceError {
  const marker = parseAgentWorkspaceMarker(reason);
  if (!marker) {
    return new AgentWorkspaceError(
      "locked-foreign",
      `Worktree ${root} is locked by another tool (${reason || "no reason"}).`,
      reason,
    );
  }
  if (markerOwnerStatus(marker) === "absent") {
    return new AgentWorkspaceError(
      "locked-orphaned",
      `Worktree ${root} carries an orphaned SuPi lock (${reason}) whose owner has exited; run /supi-agent-cleanup to release it.`,
      reason,
    );
  }
  return new AgentWorkspaceError(
    "locked-active",
    `Worktree ${root} is held by an active SuPi owner (${reason}).`,
    reason,
  );
}

async function findRecord(root: string, signal?: AbortSignal) {
  return (await listWorktrees(root, signal)).find((record) => record.path === root);
}

function refuseUnavailable(root: string, record?: WorktreeRecord): void {
  if (!record) throw new Error(`Git does not list ${root} as a worktree.`);
  if (record.lockReason !== undefined) throw lockedError(root, record.lockReason);
}

/**
 * Lease the linked worktree containing `cwd` with a `supi-agent:<owner>:` lock. Rejects with an
 * {@link AgentWorkspaceError} for the main worktree and for any existing lock, foreign or SuPi;
 * orphaned SuPi locks are never taken over.
 */
export async function acquireWorktreeLease(
  options: AcquireWorktreeLeaseOptions,
): Promise<WorktreeLease> {
  const { signal } = options;
  const { root, linked } = await describeWorktree(options.cwd, signal);
  if (!linked) {
    throw new AgentWorkspaceError("main-worktree", `Git cannot lock the main worktree ${root}.`);
  }
  refuseUnavailable(root, await findRecord(root, signal));
  const marker = createAgentWorkspaceMarker(options.owner);
  const unlockOwn = (): Promise<void> => unlockIfOwned(root, marker);
  signal?.throwIfAborted();
  // Lock and compensate without the signal: an abort must not leave a lock no lease object owns.
  try {
    await runGit(root, ["worktree", "lock", "--reason", marker, root]);
  } catch (error) {
    // Another process may have locked it between the inventory and the lock.
    const after = await findRecord(root);
    if (after?.lockReason === marker) await unlockOwn();
    else refuseUnavailable(root, after);
    throw error;
  }
  if (signal?.aborted) {
    await unlockOwn();
    signal.throwIfAborted();
  }
  return ownedLease(root, marker);
}

/** Unlock the worktree at `root` only when it still carries `marker`. */
export async function unlockIfOwned(root: string, marker: string): Promise<void> {
  const record = await findRecord(root);
  if (record?.lockReason === marker) await runGitAllowFatal(root, ["worktree", "unlock", root]);
}

/** A lease object for a lock this process wrote with `marker`. */
export function ownedLease(root: string, marker: string): WorktreeLease {
  let released = false;
  return {
    root,
    marker,
    async release() {
      if (released) return;
      released = true;
      await unlockIfOwned(root, marker);
    },
  };
}
