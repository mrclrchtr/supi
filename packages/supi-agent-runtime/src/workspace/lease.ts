import { runGit, runGitAllowFatal } from "./git.ts";
import {
  createAgentWorkspaceMarker,
  markerOwnerStatus,
  parseAgentWorkspaceMarker,
} from "./marker.ts";
import { AgentWorkspaceError, type AgentWorkspaceOwner } from "./types.ts";
import { listWorktrees, resolveWorktreeRoot, type WorktreeRecord } from "./worktrees.ts";

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
      `Worktree ${root} is locked by another tool: ${reason || "(no reason)"}.`,
      reason,
    );
  }
  if (markerOwnerStatus(marker) === "absent") {
    return new AgentWorkspaceError(
      "locked-orphaned",
      `Worktree ${root} carries an orphaned SuPi lock whose owner has exited; clean it up before reuse.`,
      reason,
    );
  }
  return new AgentWorkspaceError(
    "locked-active",
    `Worktree ${root} is locked by an active SuPi owner: ${reason}.`,
    reason,
  );
}

async function findRecord(root: string, signal?: AbortSignal) {
  const records = await listWorktrees(root, signal);
  return { main: records[0], record: records.find((record) => record.path === root) };
}

function refuseUnavailable(root: string, main?: WorktreeRecord, record?: WorktreeRecord): void {
  if (main?.path === root) {
    throw new AgentWorkspaceError("main-worktree", `Git cannot lock the main worktree ${root}.`);
  }
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
  const root = await resolveWorktreeRoot(options.cwd, signal);
  const before = await findRecord(root, signal);
  refuseUnavailable(root, before.main, before.record);
  const marker = createAgentWorkspaceMarker(options.owner);
  try {
    await runGit(root, ["worktree", "lock", "--reason", marker, root], signal);
  } catch (error) {
    // Another process may have locked it between the inventory and the lock.
    const after = await findRecord(root, signal);
    refuseUnavailable(root, after.main, after.record);
    throw error;
  }
  let released = false;
  return {
    root,
    marker,
    async release() {
      if (released) return;
      released = true;
      const { record } = await findRecord(root);
      if (record?.lockReason === marker) await runGitAllowFatal(root, ["worktree", "unlock", root]);
    },
  };
}
