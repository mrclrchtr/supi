import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AgentRunRegistry, RunBatch, RunBatchOwner } from "@mrclrchtr/supi-agent-runtime/api";
import { loadAgentConfig } from "../config.ts";
import { preflightDelegationBatch, type ResolvedTask } from "../tool/agent_run/batch-preflight.ts";
import { startDelegationBatchWithAuxiliaryModels } from "../tool/agent_run/batch-runner.ts";
import type {
  BatchTaskResult,
  DelegationBatchHandle,
  DelegationStartOptions,
} from "../tool/agent_run/batch-types.ts";
import type { AgentRunToolParams } from "../tool/agent_run/schema.ts";
import {
  admitMode,
  assertWorktreeRequestsAdmissible,
  beginWithLeases,
  rejection,
  waitForRelease,
} from "./admission.ts";
import { DelegationConversationState } from "./conversation-state.ts";
import {
  type CreatedWorktreeSet,
  createRequestedWorktrees,
  worktreeRequestIds,
} from "./created-worktrees.ts";
import {
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
    const { params, ctx } = options;
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
    const validated = this.#preflight(params, options);
    if (worktreeRequestIds(params).size === 0) {
      return this.#admit({ options, params, tasks: validated, activeBranch });
    }
    // Validate profiles and capacity before creating worktrees, then preflight again in them.
    assertWorktreeRequestsAdmissible(params, validated);
    this.#assertCapacity(validated.length, ctx);
    // Reject what creation cannot change before paying for checkout and bootstrap: the claims and
    // mode of the other tasks. Each created worktree will be leased.
    const requested = worktreeRequestIds(params);
    const otherClaims = await this.#resolveClaims(
      validated.filter((task) => !requested.has(task.taskId)),
      ctx,
    );
    admitMode(
      params.mode,
      [
        ...otherClaims,
        ...[...requested].map((taskId) => ({ taskId, root: "", kind: "lease" as const })),
      ],
      validated.length,
      ctx,
    );
    if (ctx.signal?.aborted) throw new Error("Delegation start canceled.");
    const created = await createRequestedWorktrees({
      params,
      parentCwd: ctx.cwd,
      bootstrapCommand: loadAgentConfig(ctx.cwd).bootstrapCommand,
      ...(ctx.signal ? { signal: ctx.signal } : {}),
    }).catch((error: unknown) => {
      if (ctx.signal?.aborted) throw new Error("Delegation start canceled.");
      throw rejection([(error as Error).message]);
    });
    try {
      const tasks = this.#preflight(created.params, options).map((task) => {
        const entry = created.byTask.get(task.taskId);
        return entry ? { ...task, createdWorktree: entry.summary } : task;
      });
      return await this.#admit({ options, params: created.params, tasks, activeBranch, created });
    } catch (error) {
      await created.discard();
      throw error;
    }
  }

  #preflight(params: AgentRunToolParams, options: DelegationStartOptions): ResolvedTask[] {
    const preflight = preflightDelegationBatch(
      params,
      options.catalogue,
      options.ctx,
      options.webTools,
    );
    if ("errors" in preflight) {
      throw new Error(
        `Delegation Batch preflight failed:\n${preflight.errors.map((error) => error.message).join("\n")}`,
      );
    }
    return preflight.tasks;
  }

  #assertCapacity(taskCount: number, ctx: ExtensionContext): void {
    const active = this.registry
      .snapshot()
      .runs.filter(
        (run) => run.kind === "Agent Run" && run.active && run.status !== "retrospecting",
      );
    const limit = loadAgentConfig(ctx.cwd).maxConcurrentRuns;
    if (active.length + this.#reserved + taskCount > limit) {
      const batches = [...new Set(active.map((run) => run.batchId))].slice(0, 4);
      throw new Error(
        `Agent Run capacity exceeded: ${active.length + this.#reserved}/${limit} active. No tasks started. Active batches: ${batches.join(", ") || "none"}.`,
      );
    }
  }

  /**
   * Claim, reserve, and start preflighted tasks. `created` holds the worktrees created for this
   * batch: their leases are already held, and they are discarded when no run starts.
   */
  async #admit(admission: {
    options: DelegationStartOptions;
    params: AgentRunToolParams;
    tasks: readonly ResolvedTask[];
    activeBranch: ReturnType<ExtensionContext["sessionManager"]["getBranch"]>;
    created?: CreatedWorktreeSet;
  }): Promise<ManagedBatch> {
    const { options, params, tasks, activeBranch, created } = admission;
    const { ctx, callId, onUpdate } = options;
    const onBranch = (batch: ManagedBatch) => this.batches.isOnBranch(batch);
    const preflight = { tasks: [...tasks] };
    const heldLeases = new Map(
      [...(created?.byTask.values() ?? [])].map((entry) => [entry.taskId, entry.workspace.lease]),
    );
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
    this.#assertCapacity(preflight.tasks.length, ctx);
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
          return beginWithLeases({
            claims,
            reservation,
            heldLeases,
            signal: control.signal,
            start: ({ onTaskDisposed, onDisposed }, handOffRelease) =>
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
                  // From here runs may work in created worktrees; never remove them.
                  created?.keep();
                  handOffRelease();
                  return true;
                },
                control.signal,
              ),
          });
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
