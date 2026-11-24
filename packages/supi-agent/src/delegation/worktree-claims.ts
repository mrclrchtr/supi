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
  /** True when a claim of an active batch of the session holds the root, false for one of this batch. */
  readonly heldByActiveBatch: boolean;
}

/** Inputs of {@link resolveWorktreeClaims}. */
export interface ResolveWorktreeClaimsOptions {
  readonly parentCwd: string;
  readonly tasks: readonly WorktreeClaimTask[];
  /** Holders of the session's active claims by canonical root, read after worktrees resolve. */
  readonly activeClaims: Pick<ReadonlyMap<string, string>, "get">;
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
    const sessionHolder = options.activeClaims.get(root);
    const heldBy = sessionHolder ?? batchHolders.get(root);
    if (heldBy !== undefined) {
      conflicts.push({
        taskId: task.taskId,
        root,
        heldBy,
        heldByActiveBatch: sessionHolder !== undefined,
      });
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
 * Acquire the `delegation` leases of the given claims one after another, keyed by task ID. On the
 * first failure, release the leases already acquired and return the failure; nothing stays locked.
 */
export async function acquireWorktreeClaimLeases(
  claims: readonly WorktreeClaim[],
  signal?: AbortSignal,
): Promise<{ leases: Map<string, WorktreeLease> } | { failure: WorktreeLeaseFailure }> {
  const leases = new Map<string, WorktreeLease>();
  for (const claim of claims) {
    if (claim.kind !== "lease") continue;
    try {
      leases.set(
        claim.taskId,
        await acquireWorktreeLease({ cwd: claim.root, owner: "delegation", signal }),
      );
    } catch (error) {
      await Promise.allSettled([...leases.values()].map((lease) => lease.release()));
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

/** A reserved set of claims; see {@link WorktreeClaimTable.reserve}. */
export interface WorktreeClaimReservation {
  /** Mark the claim of a task whose result is published; it is held only until disposal. */
  finish(taskId: string): void;
  /** Release the claim of one task once its run has disposed its resources. Idempotent. */
  releaseTask(taskId: string): void;
  /** Release every claim of the reservation not released yet. Idempotent. */
  release(): void;
}

interface ClaimHolder {
  readonly taskId: string;
  finishing: boolean;
}

/**
 * The session's active Worktree Claims by canonical root. Reservation is synchronous, so two
 * concurrent `agent_run` starts cannot both reserve one root. A claim whose task has published
 * its result stays held until the run has disposed its resources (after any retrospective), but
 * is marked finishing so a waiting start can tell it will be released soon.
 */
export class WorktreeClaimTable {
  readonly #holders = new Map<string, ClaimHolder>();
  #releaseWaiters: Array<() => void> = [];

  /** Live holder descriptions by canonical root. */
  holders(): Pick<ReadonlyMap<string, string>, "get"> {
    return {
      get: (root) => {
        const holder = this.#holders.get(root);
        return holder && `task "${holder.taskId}" of an active batch`;
      },
    };
  }

  /** Whether a session claim holds the root. */
  holds(root: string): boolean {
    return this.#holders.has(root);
  }

  /** The task ID of the finishing claim that holds the root, if any. */
  finishingHolder(root: string): string | undefined {
    const holder = this.#holders.get(root);
    return holder?.finishing ? holder.taskId : undefined;
  }

  /**
   * Actionable text for a writer whose worktree is claimed: the finishing message when a finishing
   * claim of the session holds the root, otherwise the conflict message naming `heldBy`.
   */
  conflictMessage(root: string, heldBy: string): string {
    const finishing = this.finishingHolder(root);
    return finishing === undefined
      ? worktreeConflictMessage(root, heldBy)
      : worktreeFinishingMessage(root, finishing);
  }

  /** Resolve on the next release of any claim. */
  nextRelease(): Promise<void> {
    return new Promise((resolve) => this.#releaseWaiters.push(resolve));
  }

  /** Reserve every claim or none. Throws when a root became claimed since resolution. */
  reserve(claims: readonly WorktreeClaim[]): WorktreeClaimReservation {
    const conflict = claims.find((claim) => this.#holders.has(claim.root));
    if (conflict) {
      const heldBy = this.holders().get(conflict.root) ?? "another task";
      throw new Error(`${conflict.taskId}: ${this.conflictMessage(conflict.root, heldBy)}`);
    }
    const holders = claims.map((claim) => {
      const holder: ClaimHolder = { taskId: claim.taskId, finishing: false };
      this.#holders.set(claim.root, holder);
      return holder;
    });
    const pending = new Set(claims.map((_claim, index) => index));
    const releaseWhere = (matches: (claim: WorktreeClaim) => boolean) => {
      let changed = false;
      for (const index of pending) {
        const claim = claims[index] as WorktreeClaim;
        if (!matches(claim)) continue;
        pending.delete(index);
        if (this.#holders.get(claim.root) === holders[index]) this.#holders.delete(claim.root);
        changed = true;
      }
      if (!changed) return;
      const waiters = this.#releaseWaiters;
      this.#releaseWaiters = [];
      for (const waiter of waiters) waiter();
    };
    return {
      finish: (taskId) => {
        for (const holder of holders) if (holder.taskId === taskId) holder.finishing = true;
      },
      releaseTask: (taskId) => releaseWhere((claim) => claim.taskId === taskId),
      release: () => releaseWhere(() => true),
    };
  }
}

/** Actionable text for a writer whose worktree another writer already claims. */
function worktreeConflictMessage(root: string, heldBy: string): string {
  return `Worktree ${root} is already claimed by ${heldBy}. Give each writer its own linked worktree with new.cwd.`;
}

/** Actionable text for a writer whose worktree a finished task has not released yet. */
function worktreeFinishingMessage(root: string, taskId: string): string {
  return `Worktree ${root} is held by task "${taskId}", which has finished and is completing its retrospective or cleanup; retry in a few seconds.`;
}
