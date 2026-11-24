import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AgentRunRegistry, RunBatch, RunBatchOwner } from "@mrclrchtr/supi-agent-runtime/api";
import type { WorktreeLease } from "@mrclrchtr/supi-agent-runtime/workspace";
import { loadAgentConfig } from "../config.ts";
import { preflightDelegationBatch, type ResolvedTask } from "../tool/agent_run/batch-preflight.ts";
import { startDelegationBatchWithAuxiliaryModels } from "../tool/agent_run/batch-runner.ts";
import type {
  BatchTaskResult,
  DelegationBatchHandle,
  DelegationStartOptions,
} from "../tool/agent_run/batch-types.ts";
import { DelegationConversationState } from "./conversation-state.ts";
import {
  acquireWorktreeClaimLeases,
  resolveWorktreeClaims,
  type WorktreeClaim,
  type WorktreeClaimConflict,
  type WorktreeClaimReservation,
  WorktreeClaimTable,
} from "./worktree-claims.ts";

/** How long a start waits for finishing writers to release the worktrees it needs. */
const FINISHING_CLAIM_WAIT_MS = 60_000;

/** Agent data kept with each session-owned Delegation Batch. */
export interface DelegationBatchData {
  /** Conversation ID by Delegation Task ID. */
  readonly taskConversations: ReadonlyMap<string, string>;
}

/** One session-owned Delegation Batch and its launch identity, owned by the runtime. */
export type ManagedBatch = RunBatch<DelegationBatchHandle, DelegationBatchData>;

/**
 * Own Agent admission (profiles, capability mode, capacity, conversation locks) and Delegation
 * Checkpoints. The runtime owns the started batches, Completion Notices, waiting, and Usage.
 */
export class DelegationController {
  readonly #conversationState = new DelegationConversationState();
  readonly #claims = new WorktreeClaimTable();
  #reserved = 0;

  constructor(
    readonly registry: AgentRunRegistry,
    readonly batches: RunBatchOwner<DelegationBatchHandle, DelegationBatchData>,
  ) {}

  /** Reconcile checkpoint claims with the raw active branch. */
  reconcile(branch: Parameters<DelegationConversationState["reconcile"]>[0], release: boolean) {
    this.#conversationState.reconcile(branch, release);
  }

  /** Validate all tasks before starting a session-owned batch. */
  async start(options: DelegationStartOptions): Promise<ManagedBatch> {
    const { params, catalogue, ctx, callId, onUpdate } = options;
    if (!this.batches.open(ctx)) throw new Error("The delegation session is closed.");
    if (ctx.signal?.aborted) throw new Error("Delegation start canceled.");
    const activeBranch = ctx.sessionManager.getBranch();
    const onBranch = (batch: ManagedBatch) => this.batches.isOnBranch(batch);
    const requestedContinuations = params.tasks.flatMap((task) =>
      "continue" in task ? [{ taskId: task.id, conversationId: task.continue.conversationId }] : [],
    );
    this.#conversationState.assertAvailable(
      requestedContinuations,
      this.batches.batches(),
      activeBranch,
      onBranch,
    );
    const preflight = preflightDelegationBatch(params, catalogue, ctx, options.webTools);
    if ("errors" in preflight) {
      throw new Error(
        `Delegation Batch preflight failed:\n${preflight.errors.map((error) => error.message).join("\n")}`,
      );
    }
    const claims = await this.#resolveClaims(preflight.tasks, ctx);
    if (ctx.signal?.aborted) throw new Error("Delegation start canceled.");
    const mode = admitMode(params.mode, claims, preflight.tasks.length, ctx);
    this.#conversationState.reconcile(activeBranch);
    this.#conversationState.assertAvailable(
      preflight.tasks,
      this.batches.batches(),
      activeBranch,
      onBranch,
    );
    // The runtime rejects a background batch whose launch is not on the active branch.
    const launchId = this.batches.findLaunch(callId, ctx);
    const active = this.registry
      .snapshot()
      .runs.filter(
        (run) => run.kind === "Agent Run" && run.active && run.status !== "retrospecting",
      );
    const limit = loadAgentConfig(ctx.cwd).maxConcurrentRuns;
    if (active.length + this.#reserved + preflight.tasks.length > limit) {
      const batches = [...new Set(active.map((run) => run.batchId))].slice(0, 4);
      throw new Error(
        `Agent Run capacity exceeded: ${active.length + this.#reserved}/${limit} active. No tasks started. Active batches: ${batches.join(", ") || "none"}.`,
      );
    }
    const releaseStarting = this.#conversationState.reserveStarting(preflight.tasks);
    let reservation: WorktreeClaimReservation;
    try {
      reservation = this.#claims.reserve(claims);
    } catch (error) {
      releaseStarting();
      throw rejection([(error as Error).message]);
    }
    this.#reserved += preflight.tasks.length;
    let begun = false;
    return this.batches
      .start({
        callId,
        mode,
        launchId,
        data: {
          taskConversations: new Map(
            preflight.tasks.map((task) => [task.taskId, task.conversationId]),
          ),
        },
        signal: ctx.signal,
        begin: (control) => {
          begun = true;
          return beginWithLeases(
            claims,
            reservation,
            control.signal,
            ({ onTaskDisposed, onDisposed }, handOffRelease) =>
              startDelegationBatchWithAuxiliaryModels(
                {
                  params,
                  tasks: preflight.tasks,
                  cwd: ctx.cwd,
                  registry: this.registry,
                  ...(mode === "foreground" ? { signal: ctx.signal, onUpdate } : {}),
                  onTaskResult: (result, batchId) => {
                    reservation.finish(result.taskId);
                    control.taskSettled(batchId);
                  },
                  onTaskDisposed,
                  onDisposed,
                },
                () => {
                  if (!control.isOpen() || ctx.signal?.aborted) return false;
                  const branch = ctx.sessionManager.getBranch();
                  this.#conversationState.assertCurrentBranch(preflight.tasks, launchId, branch);
                  handOffRelease();
                  return true;
                },
                control.signal,
              ),
          );
        },
      })
      .catch((error: unknown) => {
        // A start refused before `begin` never reaches the lease owner.
        if (!begun) reservation.release();
        throw error;
      })
      .finally(() => {
        releaseStarting();
        this.#reserved -= preflight.tasks.length;
      });
  }

  /**
   * Resolve the batch's Worktree Claims; any conflict rejects the whole batch. When every conflict
   * is with a session claim whose task has already published its result, wait (bounded) for those
   * claims to be released, then resolve again.
   */
  async #resolveClaims(
    tasks: readonly ResolvedTask[],
    ctx: ExtensionContext,
  ): Promise<WorktreeClaim[]> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut: Promise<"timeout"> | undefined;
    let expired = false;
    try {
      for (;;) {
        const resolution = await resolveWorktreeClaims({
          parentCwd: ctx.cwd,
          tasks: tasks.map((task) => ({
            taskId: task.taskId,
            readOnly: task.readOnly,
            cwd: task.inputs.cwd,
          })),
          activeClaims: this.#claims.holders(),
          ...(ctx.signal ? { signal: ctx.signal } : {}),
        });
        if ("claims" in resolution) return resolution.claims;
        const finishing = (conflict: WorktreeClaimConflict) =>
          conflict.heldByActiveBatch && this.#claims.finishingHolder(conflict.root) !== undefined;
        if (expired || !resolution.conflicts.every(finishing)) {
          throw rejection(
            resolution.conflicts.map(
              (conflict) =>
                `${conflict.taskId}: ${this.#claims.conflictMessage(conflict.root, conflict.heldBy)}`,
            ),
          );
        }
        const roots = resolution.conflicts.map((conflict) => conflict.root);
        timedOut ??= new Promise((resolve) => {
          timer = setTimeout(() => resolve("timeout"), FINISHING_CLAIM_WAIT_MS);
        });
        // Resolve again on timeout so the rejection names the current holders.
        expired = (await waitForRelease(this.#claims, roots, timedOut, ctx.signal)) === "timeout";
        if (ctx.signal?.aborted) throw new Error("Delegation start canceled.");
      }
    } finally {
      clearTimeout(timer);
    }
  }

  /** Prepare one collection payload, omitting checkpoints already stored or claimed. */
  prepareCheckpointTasks(
    callId: string,
    batch: ManagedBatch,
    ctx: ExtensionContext,
  ): BatchTaskResult[] {
    return this.#conversationState.prepareCheckpointTasks(
      callId,
      batch,
      ctx.sessionManager.getBranch(),
    );
  }

  /** Confirm stored results, checkpoints, and Usage before labeling a repeated collection. */
  isCollected(batch: ManagedBatch, ctx: ExtensionContext): boolean {
    return (
      this.#conversationState.isCollected(batch, ctx.sessionManager.getBranch()) &&
      batch.handle
        .snapshot()
        .results.every((task) => !task.usage || this.batches.usageReported(batch, task.taskId))
    );
  }

  /** Return list-safe saved/live conversation facts from the active parent branch. */
  conversations(ctx: ExtensionContext): ReturnType<DelegationConversationState["listCandidates"]> {
    this.batches.open(ctx);
    return this.#conversationState.listCandidates(
      this.batches.batches(),
      ctx.sessionManager.getBranch(),
      (batch) => this.batches.isOnBranch(batch),
    );
  }
}

/** Wait until none of the roots is held any more, the wait times out, or the start is aborted. */
async function waitForRelease(
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

function rejection(lines: readonly string[]): Error {
  return new Error(`Delegation Batch rejected; no tasks started:\n${lines.join("\n")}`);
}

/**
 * Admit the execution mode. A batch whose writers all hold leases runs like a read-only batch:
 * background by default in TUI and RPC. A writer with only a session claim keeps the single-task
 * foreground rule.
 */
function admitMode(
  requested: "background" | "foreground" | undefined,
  claims: readonly WorktreeClaim[],
  taskCount: number,
  ctx: ExtensionContext,
): "background" | "foreground" {
  const sessionWriter = claims.find((claim) => claim.kind === "session");
  if (sessionWriter && taskCount > 1) {
    throw rejection([
      `${sessionWriter.taskId}: A writer in the main worktree or the parent's worktree requires a single-task foreground batch. Give it its own linked worktree with new.cwd to run it next to other tasks.`,
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
      `${sessionWriter.taskId}: A writer in the main worktree or the parent's worktree cannot run in the background. Give it its own linked worktree with new.cwd.`,
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
function beginWithLeases(
  claims: readonly WorktreeClaim[],
  reservation: WorktreeClaimReservation,
  signal: AbortSignal,
  start: (
    release: { onTaskDisposed: (taskId: string) => Promise<void>; onDisposed: () => Promise<void> },
    handOffRelease: () => void,
  ) => { result: Promise<DelegationBatchHandle>; settled: Promise<void> },
): { result: Promise<DelegationBatchHandle>; settled: Promise<void> } {
  let leases = new Map<string, WorktreeLease>();
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
  const acquired = acquireWorktreeClaimLeases(claims, signal).then((acquisition) => {
    if ("failure" in acquisition) {
      const { taskId, message } = acquisition.failure;
      throw rejection([`${taskId}: ${message}`]);
    }
    leases = acquisition.leases;
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
