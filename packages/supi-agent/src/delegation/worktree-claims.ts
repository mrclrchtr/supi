import { realpath } from "node:fs/promises";
import { resolve } from "node:path";
import {
  AgentWorkspaceError,
  acquireWorktreeLease,
  describeWorktree,
  type WorktreeDescription,
  type WorktreeLease,
} from "@mrclrchtr/supi-agent-runtime/workspace";

/** One Delegation Task as seen by Worktree Claim resolution. */
export interface WorktreeClaimTask {
  readonly taskId: string;
  /** Read-only tasks take no claim. */
  readonly readOnly: boolean;
  /** Resolved working directory of the task. */
  readonly cwd: string;
}

/**
 * A Worktree Claim a writer must take before it starts: `session` for the main worktree and the
 * parent's own worktree (Git cannot lock the main worktree, and the parent's belongs to the
 * human), `lease` through a runtime `git worktree lock` for any other linked worktree.
 */
export interface WorktreeClaim {
  readonly taskId: string;
  /** Canonical worktree root. */
  readonly root: string;
  readonly kind: "lease" | "session";
}

/** A writer whose worktree is already claimed; `heldBy` names the holder. */
export interface WorktreeClaimConflict {
  readonly taskId: string;
  readonly root: string;
  readonly heldBy: string;
}

/** Inputs of {@link resolveWorktreeClaims}. */
export interface ResolveWorktreeClaimsOptions {
  readonly parentCwd: string;
  readonly tasks: readonly WorktreeClaimTask[];
  /** Holders of the session's active claims by canonical root. */
  readonly activeClaims: ReadonlyMap<string, string>;
  readonly signal?: AbortSignal;
}

/**
 * Resolve the Worktree Claims of one Delegation Batch, or every conflict with a claim of the same
 * batch or an active claim of the session. Roots are canonical (Git top level plus `realpath`), so
 * subdirectories and symlink aliases of one worktree conflict. A directory outside Git resolves to
 * its own `realpath` and takes a session claim. Lock state is not checked here; acquiring the
 * leases does that.
 */
export async function resolveWorktreeClaims(
  options: ResolveWorktreeClaimsOptions,
): Promise<{ claims: WorktreeClaim[] } | { conflicts: WorktreeClaimConflict[] }> {
  const { signal } = options;
  const writers = options.tasks.filter((task) => !task.readOnly);
  if (writers.length === 0) return { claims: [] };
  const parent = await locateWorktree(options.parentCwd, signal);
  const located = await Promise.all(writers.map((task) => locateWorktree(task.cwd, signal)));
  const claims: WorktreeClaim[] = [];
  const conflicts: WorktreeClaimConflict[] = [];
  const batchHolders = new Map<string, string>();
  writers.forEach((task, index) => {
    const { root, linked } = located[index] as WorktreeDescription;
    const heldBy = options.activeClaims.get(root) ?? batchHolders.get(root);
    if (heldBy !== undefined) {
      conflicts.push({ taskId: task.taskId, root, heldBy });
      return;
    }
    batchHolders.set(root, `task "${task.taskId}" of this batch`);
    const kind = linked && root !== parent.root ? "lease" : "session";
    claims.push({ taskId: task.taskId, root, kind });
  });
  return conflicts.length > 0 ? { conflicts } : { claims };
}

/** A lease that could not be acquired, with an actionable reason. */
export interface WorktreeLeaseFailure {
  readonly taskId: string;
  readonly root: string;
  /** Actionable sentence that names the worktree and its holder. */
  readonly message: string;
}

/**
 * Acquire the `delegation` leases of the given claims one after another. On the first failure,
 * release the leases already acquired and return the failure; nothing stays locked.
 */
export async function acquireWorktreeClaimLeases(
  claims: readonly WorktreeClaim[],
  signal?: AbortSignal,
): Promise<{ leases: WorktreeLease[] } | { failure: WorktreeLeaseFailure }> {
  const leases: WorktreeLease[] = [];
  for (const claim of claims) {
    if (claim.kind !== "lease") continue;
    try {
      leases.push(await acquireWorktreeLease({ cwd: claim.root, owner: "delegation", signal }));
    } catch (error) {
      await Promise.allSettled(leases.map((lease) => lease.release()));
      return {
        failure: {
          taskId: claim.taskId,
          root: claim.root,
          message: leaseFailure(claim.root, error),
        },
      };
    }
  }
  return { leases };
}

function leaseFailure(root: string, error: unknown): string {
  // The runtime message names the holder and, for an orphaned lock, the cleanup command.
  return error instanceof AgentWorkspaceError
    ? error.message
    : `Worktree ${root} could not be locked for this writer.`;
}

async function locateWorktree(cwd: string, signal?: AbortSignal): Promise<WorktreeDescription> {
  try {
    return await describeWorktree(cwd, signal);
  } catch {
    // A directory outside Git takes a session claim on its own path.
    return { root: await realpath(cwd).catch(() => resolve(cwd)), linked: false };
  }
}

/**
 * The session's active Worktree Claims by canonical root. Reservation is synchronous, so two
 * concurrent `agent_run` starts cannot both reserve one root.
 */
export class WorktreeClaimTable {
  readonly #holders = new Map<string, string>();

  /** Holder descriptions by canonical root. */
  holders(): ReadonlyMap<string, string> {
    return this.#holders;
  }

  /**
   * Reserve every claim or none. Throws when a root became claimed since resolution. Returns an
   * idempotent release.
   */
  reserve(claims: readonly WorktreeClaim[]): () => void {
    const conflict = claims.find((claim) => this.#holders.has(claim.root));
    if (conflict) {
      throw new Error(
        `${conflict.taskId}: ${worktreeConflictMessage(conflict.root, this.#holders.get(conflict.root) ?? "another task")}`,
      );
    }
    for (const claim of claims) {
      this.#holders.set(claim.root, `task "${claim.taskId}" of an active batch`);
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      for (const claim of claims) this.#holders.delete(claim.root);
    };
  }
}

/** Actionable text for a writer whose worktree another writer already claims. */
export function worktreeConflictMessage(root: string, heldBy: string): string {
  return `Worktree ${root} is already claimed by ${heldBy}. Give each writer its own linked worktree with new.cwd.`;
}
