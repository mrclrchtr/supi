import { rm, rmdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { ExtensionContext, SessionEntry } from "@earendil-works/pi-coding-agent";
import type { AgentRunRegistry } from "@mrclrchtr/supi-agent-runtime/api";
import { recordDebugEvent } from "@mrclrchtr/supi-core/debug";
import { isReadOnlyCapabilitySet } from "../capabilities.ts";
import { loadAgentConfig } from "../config.ts";
import { preflightDelegationBatch } from "../tool/agent_run/batch-preflight.ts";
import { startDelegationBatchWithAuxiliaryModels } from "../tool/agent_run/batch-runner.ts";
import type {
  BatchProgressState,
  BatchTaskResult,
  DelegationBatchHandle,
} from "../tool/agent_run/batch-types.ts";
import type { AgentRunToolParams } from "../tool/agent_run/schema.ts";
import type { ProfileCatalogue } from "../types.ts";
import { DelegationConversationState, getSuccessfulCollection } from "./conversation-state.ts";
import { DelegationUsageReceipts } from "./usage-receipts.ts";
import { waitForDelegation } from "./wait.ts";

/** One session-owned batch and its launch identity. */
export interface ManagedBatch {
  readonly handle: DelegationBatchHandle;
  readonly mode: "foreground" | "background";
  readonly callId: string;
  readonly taskConversations: ReadonlyMap<string, string>;
  readonly launchId?: string;
  readonly sharedContext?: string;
  readonly notified: Set<string>;
  acknowledged: boolean;
  abandoned: boolean;
}

/** Own delegation admission, retained results, and completion delivery for one session. */
export class DelegationController {
  readonly #batches = new Map<string, ManagedBatch>();
  readonly #starting = new Set<Promise<void>>();
  readonly #outputPaths = new Set<string>();
  readonly receipts = new DelegationUsageReceipts();
  readonly #conversationState = new DelegationConversationState();
  #manager?: ExtensionContext["sessionManager"];
  #closed = false;
  #reserved = 0;
  #paused = false;
  #parentSignal?: AbortSignal;
  #removeParentAbort?: () => void;
  readonly #shutdown = new AbortController();
  #noticeTimer?: ReturnType<typeof setTimeout>;

  constructor(
    readonly registry: AgentRunRegistry,
    private readonly notify: (batchId: string, tasks: readonly BatchTaskResult[]) => void,
  ) {}

  /** Validate all tasks before starting a session-owned batch. */
  async start(options: {
    params: AgentRunToolParams;
    catalogue: ProfileCatalogue;
    ctx: ExtensionContext;
    callId: string;
    onUpdate?: (state: BatchProgressState) => void;
  }): Promise<ManagedBatch> {
    if (this.#closed) throw new Error("The delegation session is closed.");
    const { params, catalogue, ctx, callId, onUpdate } = options;
    this.observeParent(ctx.signal);
    if (ctx.signal?.aborted) throw new Error("Delegation start canceled.");
    this.#manager = ctx.sessionManager;
    const activeBranch = ctx.sessionManager.getBranch();
    const requestedContinuations = params.tasks.flatMap((task) =>
      "continue" in task ? [{ taskId: task.id, conversationId: task.continue.conversationId }] : [],
    );
    this.#conversationState.assertAvailable(
      requestedContinuations,
      this.#batches.values(),
      activeBranch,
      (batch) => this.#onBranch(batch),
    );
    const preflight = preflightDelegationBatch(params, catalogue, ctx);
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
      this.#batches.values(),
      activeBranch,
      (batch) => this.#onBranch(batch),
    );
    const launch = ctx.sessionManager
      .getBranch()
      .find(
        (entry) =>
          entry.type === "message" &&
          entry.message.role === "assistant" &&
          entry.message.content.some((part) => part.type === "toolCall" && part.id === callId),
      );
    if (mode === "background" && !launch)
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
    const startup = startDelegationBatchWithAuxiliaryModels(
      {
        params,
        tasks: preflight.tasks,
        cwd: ctx.cwd,
        registry: this.registry,
        ...(mode === "foreground" ? { signal: ctx.signal, onUpdate } : {}),
        onTaskResult: (_result, batchId) => {
          this.#updateUsage(this.#batches.get(batchId));
          this.#scheduleNotice();
        },
      },
      () => {
        if (this.#closed || ctx.signal?.aborted) return false;
        const branch = ctx.sessionManager.getBranch();
        this.#conversationState.assertCurrentBranch(preflight.tasks, launch?.id, branch);
        return true;
      },
      AbortSignal.any(ctx.signal ? [ctx.signal, this.#shutdown.signal] : [this.#shutdown.signal]),
    );
    const ownedStart = startup.result
      .then((handle) => {
        const batch: ManagedBatch = {
          handle,
          mode,
          callId,
          taskConversations: new Map(
            preflight.tasks.map((task) => [task.taskId, task.conversationId]),
          ),
          launchId: launch?.id,
          sharedContext: params.sharedContext,
          notified: new Set(),
          acknowledged: false,
          abandoned: false,
        };
        this.#batches.set(handle.batchId, batch);
        return batch;
      })
      .finally(() => {
        releaseStarting();
        this.#reserved -= preflight.tasks.length;
      });
    const ownedSettlement = Promise.allSettled([startup.settled, ownedStart]).then(() => undefined);
    this.#starting.add(ownedSettlement);
    void ownedSettlement.then(() => this.#starting.delete(ownedSettlement));
    return ownedStart;
  }

  /** Resolve only a background handle that belongs to the active branch. */
  get(batchId: string, ctx: ExtensionContext): ManagedBatch {
    this.#manager = ctx.sessionManager;
    this.observeParent(ctx.signal);
    this.receipts.reconcile(ctx.sessionManager.getEntries());
    this.#conversationState.reconcile(ctx.sessionManager.getBranch());
    const batch = this.#batches.get(batchId);
    if (this.#closed || !batch || batch.mode !== "background")
      throw new Error("Unknown or expired background batch handle.");
    if (!this.#onBranch(batch)) throw new Error("The batch launch is not on the active branch.");
    return batch;
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
        .results.every(
          (task) => !task.usage || this.receipts.reported(batch.handle.batchId, task.taskId),
        )
    );
  }

  /** Return live status for saved conversations on the active parent branch. */
  conversationActivity(ctx: ExtensionContext): ReturnType<DelegationConversationState["activity"]> {
    this.#manager = ctx.sessionManager;
    return this.#conversationState.activity(
      this.#batches.values(),
      ctx.sessionManager.getBranch(),
      (batch) => this.#onBranch(batch),
    );
  }

  /** Confirm launch results only after Pi has stored them. */
  refresh(ctx: ExtensionContext): void {
    if (this.#closed) return;
    this.#manager = ctx.sessionManager;
    const branch = ctx.sessionManager.getBranch();
    const entries = ctx.sessionManager.getEntries();
    this.receipts.reconcile(entries, true);
    this.#conversationState.reconcile(branch, true);
    this.#markCollected(branch);
    for (const batch of this.#batches.values()) {
      if (batch.mode === "background" && !this.#onBranch(batch)) {
        batch.abandoned = true;
        void batch.handle.stop().catch(() => undefined);
      }
      this.#updateUsage(batch);
      batch.acknowledged ||= branch.some(
        (entry) =>
          entry.type === "message" &&
          entry.message.role === "toolResult" &&
          entry.message.toolCallId === batch.callId &&
          !entry.message.isError,
      );
    }
    this.#scheduleNotice();
  }

  /** Omit stale notices at delivery, using successful collections on the raw active branch. */
  noticeVisible(details: unknown, ctx: ExtensionContext): boolean {
    if (this.#closed || !details || typeof details !== "object") return false;
    const { batchId, taskIds } = details as { batchId?: unknown; taskIds?: unknown };
    if (typeof batchId !== "string" || !Array.isArray(taskIds)) return false;
    this.#manager = ctx.sessionManager;
    const batch = this.#batches.get(batchId);
    if (!batch || !this.#onBranch(batch)) return false;
    const collected = new Set<string>();
    for (const entry of ctx.sessionManager.getBranch()) {
      const result = getSuccessfulCollection(entry);
      if (result?.batchId === batchId) for (const taskId of result.taskIds) collected.add(taskId);
    }
    return batch.handle
      .snapshot()
      .results.some((task) => taskIds.includes(task.taskId) && !collected.has(task.taskId));
  }

  /** Bind only the current parent operation; normal completion does not stop children. */
  observeParent(signal?: AbortSignal): void {
    if (this.#closed || !signal || signal === this.#parentSignal) return;
    this.#removeParentAbort?.();
    this.#parentSignal = signal;
    const abort = () => this.abortParent();
    signal.addEventListener("abort", abort, { once: true });
    this.#removeParentAbort = () => signal.removeEventListener("abort", abort);
    if (signal.aborted) abort();
  }

  /** Stop owned work, including post-result assessments, when a parent operation aborts. */
  abortParent(): void {
    this.#paused = true;
    clearTimeout(this.#noticeTimer);
    this.#noticeTimer = undefined;
    for (const batch of this.#batches.values()) {
      void batch.handle.stop().catch(() => undefined);
    }
  }

  /** Release operation listeners only after final parent settlement. */
  settleParent(aborted: boolean, ctx: ExtensionContext): void {
    if (aborted) this.abortParent();
    this.#removeParentAbort?.();
    this.#removeParentAbort = undefined;
    this.#parentSignal = undefined;
    this.refresh(ctx);
  }

  /** Resume delivery only after input from the user or an RPC client. */
  resumeDelivery(): void {
    this.#paused = false;
    this.#scheduleNotice();
  }

  /** Wait for a batch while observing parent and session cancellation. */
  async wait(batch: ManagedBatch, signal?: AbortSignal): Promise<void> {
    await waitForDelegation(
      batch.handle.result,
      signal ? AbortSignal.any([signal, this.#shutdown.signal]) : this.#shutdown.signal,
    );
  }

  /** Retain only internally generated spill files until session cleanup. */
  retainOutput(path: string | undefined): void {
    if (path) this.#outputPaths.add(path);
  }

  /** Close admission and await owned cleanup before releasing session state. */
  async close(): Promise<void> {
    this.#closed = true;
    this.#shutdown.abort();
    this.#removeParentAbort?.();
    clearTimeout(this.#noticeTimer);
    // Fence existing runs immediately; a pending catalogue must not delay their cancellation.
    const stopping = [...this.#batches.values()].map((batch) => batch.handle.stop());
    await Promise.allSettled([...this.#starting, ...stopping]);
    // Include handles whose already-accepted startup finished while shutdown began.
    const batches = [...this.#batches.values()];
    await Promise.allSettled(batches.map((batch) => batch.handle.stop()));
    await Promise.allSettled(batches.map((batch) => batch.handle.result));
    this.#batches.clear();
    this.#manager = undefined;
    await Promise.allSettled(
      [...this.#outputPaths].map(async (path) => {
        await rm(path, { force: true });
        await rmdir(dirname(path));
      }),
    );
    this.#outputPaths.clear();
  }

  #markCollected(entries: readonly SessionEntry[]): void {
    for (const entry of entries) {
      const result = getSuccessfulCollection(entry);
      if (!result) continue;
      const batch = this.#batches.get(result.batchId);
      if (batch) for (const taskId of result.taskIds) batch.notified.add(taskId);
    }
  }

  #updateUsage(batch?: ManagedBatch): void {
    if (this.#closed || batch?.mode !== "background") return;
    for (const task of batch.handle.snapshot().results) {
      const runKey = batch.handle.runKeys.get(task.taskId);
      if (runKey && task.usage)
        this.registry.setDisplayResult(runKey, {
          display: {
            usageStatus: this.receipts.reported(batch.handle.batchId, task.taskId)
              ? "reported"
              : "uncollected",
          },
        });
    }
  }

  #onBranch(batch: ManagedBatch): boolean {
    return (
      !!batch.launchId && !!this.#manager?.getBranch().some((entry) => entry.id === batch.launchId)
    );
  }

  #scheduleNotice(): void {
    if (this.#closed || this.#paused || this.#noticeTimer) return;
    this.#noticeTimer = setTimeout(() => {
      this.#noticeTimer = undefined;
      if (this.#closed || this.#paused || this.#parentSignal?.aborted) return;
      for (const batch of this.#batches.values()) this.#deliverNotice(batch);
    }, 0);
  }

  #deliverNotice(batch: ManagedBatch): void {
    if (
      batch.mode !== "background" ||
      batch.abandoned ||
      !batch.acknowledged ||
      !this.#onBranch(batch)
    )
      return;
    const ready = batch.handle
      .snapshot()
      .results.filter((task) => task.status !== "canceled" && !batch.notified.has(task.taskId));
    if (!ready.length) return;
    for (const task of ready) batch.notified.add(task.taskId);
    try {
      this.notify(batch.handle.batchId, ready);
    } catch {
      recordDebugEvent({
        source: "supi-agent",
        level: "warning",
        category: "delegation",
        message: "Background completion delivery failed. Results remain available for collection.",
      });
    }
  }
}
