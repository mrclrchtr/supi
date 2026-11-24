import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { WorktreeLease } from "@mrclrchtr/supi-agent-runtime/workspace";
import type { ResolvedTask } from "../tool/agent_run/batch-preflight.ts";
import type { DelegationBatchHandle } from "../tool/agent_run/batch-types.ts";
import type { AgentRunToolParams } from "../tool/agent_run/schema.ts";
import { worktreeRequestErrors, worktreeRequestIds } from "./created-worktrees.ts";
import {
  acquireWorktreeClaimLeases,
  type WorktreeClaim,
  type WorktreeClaimReservation,
  type WorktreeClaimTable,
} from "./worktree-claims.ts";

// Admission steps of the Delegation controller: mode, rejections, waits, and lease hand-off.

/** Wait until none of the roots is held any more, the wait times out, or the start is aborted. */
export async function waitForRelease(
  table: WorktreeClaimTable,
  roots: readonly string[],
  timedOut: Promise<"timeout">,
  signal: AbortSignal | undefined,
): Promise<"released" | "timeout" | "aborted"> {
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<"aborted">((resolve) => {
    onAbort = () => resolve("aborted");
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
  });
  try {
    while (roots.some((root) => table.holds(root))) {
      const outcome = await Promise.race([
        table.nextRelease().then(() => "released" as const),
        timedOut,
        aborted,
      ]);
      if (outcome !== "released") return outcome;
    }
    return "released";
  } finally {
    if (onAbort) signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Reject `new.worktree` before creating anything: it excludes `new.cwd`, and only
 * mutation-capable profiles may request it.
 */
export function assertWorktreeRequestsAdmissible(
  params: AgentRunToolParams,
  tasks: readonly ResolvedTask[],
): void {
  const requested = worktreeRequestIds(params);
  const errors = [
    ...worktreeRequestErrors(params),
    ...tasks
      .filter((task) => requested.has(task.taskId) && task.readOnly)
      .map(
        (task) =>
          `${task.taskId}: new.worktree requires a mutation-capable profile; profile "${task.profileId}" is read-only.`,
      ),
  ];
  if (errors.length > 0) throw rejection(errors);
}

export function rejection(lines: readonly string[]): Error {
  return new Error(`Delegation Batch rejected; no tasks started:\n${lines.join("\n")}`);
}

/**
 * Admit the execution mode. A batch whose writers all hold leases runs like a read-only batch:
 * background by default in TUI and RPC. A writer with only a session claim keeps the single-task
 * foreground rule.
 */
export function admitMode(
  requested: "background" | "foreground" | undefined,
  claims: readonly WorktreeClaim[],
  taskCount: number,
  ctx: ExtensionContext,
): "background" | "foreground" {
  const sessionWriter = claims.find((claim) => claim.kind === "session");
  if (sessionWriter && taskCount > 1) {
    throw rejection([
      `${sessionWriter.taskId}: A writer in the main worktree or the parent's worktree requires a single-task foreground batch. Give it its own linked worktree with new.cwd, or let agent_run create one with new.worktree, to run it next to other tasks.`,
    ]);
  }
  const interactive = ctx.mode === "tui" || ctx.mode === "rpc";
  const backgroundAllowed = !sessionWriter && interactive;
  const mode = requested ?? (backgroundAllowed ? "background" : "foreground");
  if (mode === "background" && !interactive) {
    throw new Error("Background delegation requires TUI or RPC mode.");
  }
  if (mode === "background" && sessionWriter) {
    throw rejection([
      `${sessionWriter.taskId}: A writer in the main worktree or the parent's worktree cannot run in the background. Give it its own linked worktree with new.cwd, or let agent_run create one with new.worktree.`,
    ]);
  }
  return mode;
}

/**
 * Acquire the batch's leases, then start it. Until `start` hands release ownership to the runner
 * (`handOffRelease()`), any failure releases the leases and the session claims here; afterwards
 * the runner calls `onTaskDisposed` as each started run releases its resources, which releases
 * that task's lease and claim, and `onDisposed` once all have, which releases the rest.
 */
export interface BeginWithLeasesOptions {
  readonly claims: readonly WorktreeClaim[];
  readonly reservation: WorktreeClaimReservation;
  /** Leases held already, by task ID, such as those of worktrees created for the batch. */
  readonly heldLeases: ReadonlyMap<string, WorktreeLease>;
  readonly signal: AbortSignal;
  start(
    release: { onTaskDisposed: (taskId: string) => Promise<void>; onDisposed: () => Promise<void> },
    handOffRelease: () => void,
  ): { result: Promise<DelegationBatchHandle>; settled: Promise<void> };
}

export function beginWithLeases(options: BeginWithLeasesOptions): {
  result: Promise<DelegationBatchHandle>;
  settled: Promise<void>;
} {
  const { claims, reservation, heldLeases, signal, start } = options;
  // Leases held from creation are kept; acquire only the others.
  const leases = new Map(heldLeases);
  let runnerOwnsRelease = false;
  const releases = new Map<string, Promise<void>>();
  // The lease is released before the claim, so a start admitted on the claim finds Git unlocked.
  const releaseTask = (taskId: string): Promise<void> => {
    let release = releases.get(taskId);
    if (!release) {
      release = Promise.resolve(leases.get(taskId)?.release())
        .catch(() => undefined)
        .then(() => reservation.releaseTask(taskId));
      releases.set(taskId, release);
    }
    return release;
  };
  let release: Promise<void> | undefined;
  const releaseAll = (): Promise<void> => {
    release ??= Promise.allSettled(claims.map((claim) => releaseTask(claim.taskId))).then(
      reservation.release,
    );
    return release;
  };
  const toAcquire = claims.filter((claim) => !heldLeases.has(claim.taskId));
  const acquired = acquireWorktreeClaimLeases(toAcquire, signal).then((acquisition) => {
    if ("failure" in acquisition) {
      const { taskId, message } = acquisition.failure;
      throw rejection([`${taskId}: ${message}`]);
    }
    for (const [taskId, lease] of acquisition.leases) leases.set(taskId, lease);
    return start({ onTaskDisposed: releaseTask, onDisposed: releaseAll }, () => {
      runnerOwnsRelease = true;
    });
  });
  const result = acquired
    .then((startup) => startup.result)
    .catch(async (error: unknown) => {
      if (!runnerOwnsRelease) await releaseAll();
      throw error;
    });
  const settled = Promise.allSettled([acquired.then((startup) => startup.settled), result]).then(
    () => undefined,
  );
  return { result, settled };
}
