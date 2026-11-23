import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AgentRunRegistry, RunBatch, RunBatchOwner } from "@mrclrchtr/supi-agent-runtime/api";
import { isReadOnlyCapabilitySet } from "../capabilities.ts";
import { loadAgentConfig } from "../config.ts";
import { preflightDelegationBatch } from "../tool/agent_run/batch-preflight.ts";
import { startDelegationBatchWithAuxiliaryModels } from "../tool/agent_run/batch-runner.ts";
import type {
  BatchTaskResult,
  DelegationBatchHandle,
  DelegationStartOptions,
} from "../tool/agent_run/batch-types.ts";
import { DelegationConversationState } from "./conversation-state.ts";

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
    const readOnly = preflight.tasks.every((task) =>
      isReadOnlyCapabilitySet(task.profile.manifest.tools),
    );
    const interactive = ctx.mode === "tui" || ctx.mode === "rpc";
    const backgroundAllowed = readOnly && interactive;
    const mode = params.mode ?? (backgroundAllowed ? "background" : "foreground");
    if (mode === "background" && !backgroundAllowed) {
      throw new Error("Background delegation requires read-only profiles and TUI or RPC mode.");
    }
    this.#conversationState.reconcile(activeBranch);
    this.#conversationState.assertAvailable(
      preflight.tasks,
      this.batches.batches(),
      activeBranch,
      onBranch,
    );
    const launchId = this.batches.findLaunch(callId, ctx);
    if (mode === "background" && !launchId)
      throw new Error("The background launch is not on the active branch.");
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
    this.#reserved += preflight.tasks.length;
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
        begin: (control) =>
          startDelegationBatchWithAuxiliaryModels(
            {
              params,
              tasks: preflight.tasks,
              cwd: ctx.cwd,
              registry: this.registry,
              ...(mode === "foreground" ? { signal: ctx.signal, onUpdate } : {}),
              onTaskResult: (_result, batchId) => control.taskSettled(batchId),
            },
            () => {
              if (!control.isOpen() || ctx.signal?.aborted) return false;
              const branch = ctx.sessionManager.getBranch();
              this.#conversationState.assertCurrentBranch(preflight.tasks, launchId, branch);
              return true;
            },
            control.signal,
          ),
      })
      .finally(() => {
        releaseStarting();
        this.#reserved -= preflight.tasks.length;
      });
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

  /** Retain only internally generated spill files until session cleanup. */
  retainOutput(path: string | undefined): void {
    this.batches.retainOutput(path);
  }
}
