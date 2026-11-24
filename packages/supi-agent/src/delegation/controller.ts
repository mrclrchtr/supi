import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AgentRunRegistry, RunBatch, RunBatchOwner } from "@mrclrchtr/supi-agent-runtime/api";
import type { WorktreeLease } from "@mrclrchtr/supi-agent-runtime/workspace";
import { isReadOnlyCapabilitySet } from "../capabilities.ts";
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
  WorktreeClaimTable,
  worktreeConflictMessage,
} from "./worktree-claims.ts";

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
    let releaseClaims: () => void;
    try {
      releaseClaims = this.#claims.reserve(claims);
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
          return beginWithLeases(claims, releaseClaims, control.signal, (onDisposed, claimed) =>
            startDelegationBatchWithAuxiliaryModels(
              {
                params,
                tasks: preflight.tasks,
                cwd: ctx.cwd,
                registry: this.registry,
                ...(mode === "foreground" ? { signal: ctx.signal, onUpdate } : {}),
                onTaskResult: (_result, batchId) => control.taskSettled(batchId),
                onDisposed,
              },
              () => {
                if (!control.isOpen() || ctx.signal?.aborted) return false;
                const branch = ctx.sessionManager.getBranch();
                this.#conversationState.assertCurrentBranch(preflight.tasks, launchId, branch);
                claimed();
                return true;
              },
              control.signal,
            ),
          );
        },
      })
      .catch((error: unknown) => {
        // A start refused before `begin` never reaches the lease owner.
        if (!begun) releaseClaims();
        throw error;
      })
      .finally(() => {
        releaseStarting();
        this.#reserved -= preflight.tasks.length;
      });
  }

  /** Resolve the batch's Worktree Claims; any conflict rejects the whole batch. */
  async #resolveClaims(
    tasks: readonly ResolvedTask[],
    ctx: ExtensionContext,
  ): Promise<WorktreeClaim[]> {
    const resolution = await resolveWorktreeClaims({
      parentCwd: ctx.cwd,
      tasks: tasks.map((task) => ({
        taskId: task.taskId,
        readOnly: isReadOnlyCapabilitySet(task.profile.manifest.tools),
        cwd: task.inputs.cwd,
      })),
      activeClaims: this.#claims.holders(),
      ...(ctx.signal ? { signal: ctx.signal } : {}),
    });
    if ("conflicts" in resolution) {
      throw rejection(
        resolution.conflicts.map(
          (conflict) =>
            `${conflict.taskId}: ${worktreeConflictMessage(conflict.root, conflict.heldBy)}`,
        ),
      );
    }
    return resolution.claims;
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
 * Acquire the batch's leases, then start it. Until the runner takes over (`claimed()`), any failure
 * releases the leases and the session claims here; afterwards the runner calls `onDisposed` once
 * every started run has released its resources.
 */
function beginWithLeases(
  claims: readonly WorktreeClaim[],
  releaseClaims: () => void,
  signal: AbortSignal,
  start: (
    onDisposed: () => Promise<void>,
    claimed: () => void,
  ) => { result: Promise<DelegationBatchHandle>; settled: Promise<void> },
): { result: Promise<DelegationBatchHandle>; settled: Promise<void> } {
  let leases: WorktreeLease[] = [];
  let runnerOwnsRelease = false;
  let release: Promise<void> | undefined;
  const releaseAll = (): Promise<void> => {
    release ??= Promise.allSettled(leases.map((lease) => lease.release())).then(releaseClaims);
    return release;
  };
  const acquired = acquireWorktreeClaimLeases(claims, signal).then((acquisition) => {
    if ("failure" in acquisition) {
      const { taskId, message } = acquisition.failure;
      throw rejection([`${taskId}: ${message}`]);
    }
    leases = acquisition.leases;
    return start(releaseAll, () => {
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
