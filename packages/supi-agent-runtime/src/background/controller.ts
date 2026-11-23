import { rm, rmdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Usage } from "@earendil-works/pi-ai";
import type {
  ContextEvent,
  ExtensionAPI,
  ExtensionContext,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";
import type { AgentRunRegistry } from "../session/agent-run-registry.ts";
import { syncCollectionToolActivation } from "../tool/activation.ts";
import { readResultCollection } from "./collection.ts";
import { findLaunchEntry, readNoticeTarget, sendCompletionNotice } from "./notices.ts";
import type {
  CollectableRunBatch,
  RunBatch,
  RunBatchCollection,
  RunBatchHandle,
  RunBatchOwner,
  RunBatchOwnerOptions,
  RunBatchUsageReceipt,
  StartRunBatchOptions,
} from "./types.ts";
import { RunBatchUsageReceipts } from "./usage-receipts.ts";
import { waitForRunBatch } from "./wait.ts";

interface OwnerRecord {
  pi: ExtensionAPI;
  options: RunBatchOwnerOptions<RunBatchHandle, unknown>;
}

/** One owned batch with the delivery state the runtime keeps for it. */
interface BatchRecord {
  readonly batch: RunBatch<RunBatchHandle, unknown>;
  readonly owner: OwnerRecord;
  readonly notified: Set<string>;
  acknowledged: boolean;
  abandoned: boolean;
  /** Every task is terminal; once-per-batch notices wait for it. */
  complete: boolean;
}

/**
 * The Background Run Batches of one containing session, shared by every owner package and bundled
 * runtime copy. Rules: Agent ADR 0010 and runtime ADR 0014.
 */
export class BackgroundRunBatches {
  readonly #owners = new Map<string, OwnerRecord>();
  readonly #batches = new Map<string, BatchRecord>();
  readonly #starting = new Set<Promise<void>>();
  readonly #outputPaths = new Set<string>();
  readonly #receipts = new RunBatchUsageReceipts();
  readonly #shutdown = new AbortController();
  #manager?: ExtensionContext["sessionManager"];
  #closed = false;
  #paused = false;
  #parentSignal?: AbortSignal;
  #removeParentAbort?: () => void;
  #noticeTimer?: ReturnType<typeof setTimeout>;

  constructor(private readonly registry: AgentRunRegistry) {}

  /** Register or replace one owner, keyed by its notice type. */
  registerOwner<THandle extends RunBatchHandle, TData>(
    pi: ExtensionAPI,
    options: RunBatchOwnerOptions<THandle, TData>,
  ): RunBatchOwner<THandle, TData> {
    const existing = this.#owners.get(options.noticeType);
    const owned = options as unknown as RunBatchOwnerOptions<RunBatchHandle, unknown>;
    const owner: OwnerRecord = existing ?? { pi, options: owned };
    owner.pi = pi;
    owner.options = owned;
    this.#owners.set(options.noticeType, owner);
    return this.#ownerView<THandle, TData>(owner);
  }

  #ownerView<THandle extends RunBatchHandle, TData>(
    owner: OwnerRecord,
  ): RunBatchOwner<THandle, TData> {
    type Batch = RunBatch<THandle, TData>;
    const records = () => [...this.#batches.values()].filter((record) => record.owner === owner);
    return {
      open: (ctx) => this.#open(ctx),
      findLaunch: (callId, ctx) => findLaunchEntry(callId, ctx.sessionManager.getBranch()),
      start: (options) => this.#start(owner, options) as Promise<Batch>,
      batches: () => records().map((record) => record.batch as Batch),
      isOnBranch: (batch) => this.#onBranch(batch),
      usageReported: (batch, taskId) => this.#receipts.reported(batch.handle.batchId, taskId),
      retainOutput: (path) => {
        if (path) this.#outputPaths.add(path);
      },
      syncCollectionTools: () => this.syncCollectionTools(owner.pi),
    };
  }

  /**
   * Resolve a background batch whose owner serves Result Collection and whose launch is on the
   * active branch, or throw. The same checks apply to every owner.
   */
  resolveCollection(batchId: string, ctx: ExtensionContext): CollectableRunBatch {
    this.#open(ctx);
    this.#receipts.reconcile(ctx.sessionManager.getEntries());
    const record = this.#batches.get(batchId);
    record?.owner.options.reconcile?.(ctx.sessionManager.getBranch(), false);
    const collection = record?.owner.options.collection;
    if (this.#closed || !record || !collection || record.batch.mode !== "background")
      throw new Error("Unknown or expired background batch handle.");
    if (!this.#onBranch(record.batch))
      throw new Error("The batch launch is not on the active branch.");
    return { batch: record.batch, collection, ownerKey: record.owner.options.noticeType };
  }

  /** Wait for every task while observing the caller signal and session shutdown. */
  async wait(
    batch: RunBatch<RunBatchHandle, unknown>,
    signal: AbortSignal | undefined,
    canceledMessage: string,
  ): Promise<void> {
    await waitForRunBatch(
      batch.handle.result,
      signal ? AbortSignal.any([signal, this.#shutdown.signal]) : this.#shutdown.signal,
      canceledMessage,
    );
  }

  /**
   * Reserve the unreported Usage of finalized tasks for one collection result. It counts as
   * reported only after Pi stores the `agent_result` call's result with that Usage.
   */
  prepareUsage(
    callId: string,
    batch: RunBatch<RunBatchHandle, unknown>,
  ): { usage?: Usage; usageReceipt?: RunBatchUsageReceipt } {
    return this.#receipts.prepare(callId, batch.handle.batchId, batch.handle.snapshot().results);
  }

  /**
   * The collection that renders a stored or live result: the stamped owner, else the owner of the
   * batch, else the first owner that serves collection.
   */
  collectionFor(
    ownerKey: unknown,
    batchId: unknown,
  ): RunBatchCollection<RunBatchHandle, unknown> | undefined {
    const stamped = typeof ownerKey === "string" ? this.#owners.get(ownerKey) : undefined;
    const batchOwner = typeof batchId === "string" ? this.#batches.get(batchId)?.owner : undefined;
    return (
      stamped?.options.collection ??
      batchOwner?.options.collection ??
      [...this.#owners.values()].find((owner) => owner.options.collection)?.options.collection
    );
  }

  /**
   * Activate `agent_result` and `agent_cancel` while any registered owner needs them and
   * deactivate them otherwise. Other active tools are preserved. While no owner states
   * `toolsNeeded`, Pi's activation on registration and later user choices stand.
   */
  syncCollectionTools(pi: ExtensionAPI): void {
    syncCollectionToolActivation(
      pi,
      [...this.#owners.values()].flatMap(({ options }) =>
        options.collection ? [options.collection] : [],
      ),
    );
  }

  /** Bind the active session manager and parent operation; false once the session is closed. */
  #open(ctx: ExtensionContext): boolean {
    this.#manager = ctx.sessionManager;
    this.observeParent(ctx.signal);
    return !this.#closed;
  }

  #start(
    owner: OwnerRecord,
    options: StartRunBatchOptions<RunBatchHandle, unknown>,
  ): Promise<RunBatch<RunBatchHandle, unknown>> {
    if (this.#closed) return Promise.reject(new Error("The session is closed."));
    if (options.mode === "background" && !options.launchId)
      return Promise.reject(new Error("The background launch is not on the active branch."));
    const signal = options.signal
      ? AbortSignal.any([options.signal, this.#shutdown.signal])
      : this.#shutdown.signal;
    const startup = options.begin({
      signal,
      isOpen: () => !this.#closed,
      taskSettled: (batchId) => {
        this.#updateUsage(this.#batches.get(batchId));
        this.#scheduleNotice();
      },
    });
    const owned = startup.result.then((handle) => this.#own(owner, options, handle));
    const settlement = Promise.allSettled([startup.settled, owned]).then(() => undefined);
    this.#starting.add(settlement);
    void settlement.then(() => this.#starting.delete(settlement));
    return owned;
  }

  #own(
    owner: OwnerRecord,
    options: StartRunBatchOptions<RunBatchHandle, unknown>,
    handle: RunBatchHandle,
  ): RunBatch<RunBatchHandle, unknown> {
    const { mode, callId, launchId, data } = options;
    const batch: RunBatch<RunBatchHandle, unknown> = { handle, mode, callId, launchId, data };
    const record: BatchRecord = {
      batch,
      owner,
      notified: new Set(),
      acknowledged: false,
      abandoned: false,
      complete: false,
    };
    this.#batches.set(handle.batchId, record);
    // Once-per-batch notices wait for every task to be terminal.
    const markComplete = () => {
      record.complete = true;
      this.#scheduleNotice();
    };
    handle.result.then(markComplete, markComplete);
    return batch;
  }

  /** Confirm launch results and collections only after Pi has stored them. */
  refresh(ctx: ExtensionContext): void {
    if (this.#closed) return;
    this.#manager = ctx.sessionManager;
    const branch = ctx.sessionManager.getBranch();
    this.#receipts.reconcile(ctx.sessionManager.getEntries(), true);
    for (const owner of this.#owners.values()) owner.options.reconcile?.(branch, true);
    this.#markCollected(branch);
    for (const record of this.#batches.values()) {
      const { batch } = record;
      if (batch.mode === "background" && !this.#onBranch(batch)) {
        record.abandoned = true;
        void batch.handle.stop().catch(() => undefined);
      }
      this.#updateUsage(record);
      record.acknowledged ||= branch.some(
        (entry) =>
          entry.type === "message" &&
          entry.message.role === "toolResult" &&
          entry.message.toolCallId === batch.callId &&
          !entry.message.isError,
      );
    }
    this.#scheduleNotice();
  }

  /** Drop stored Completion Notices that are stale on the raw active branch. */
  filterContext(
    messages: ContextEvent["messages"],
    ctx: ExtensionContext,
  ): { messages: ContextEvent["messages"] } | undefined {
    // A closed session receives no further context; a later session has its own batches.
    if (this.#closed) return undefined;
    const kept = messages.filter(
      (message) =>
        message.role !== "custom" ||
        !this.#owners.has(message.customType) ||
        this.#noticeVisible(message.details, ctx),
    );
    // Preserve Pi's unchanged-context path when every notice remains useful on this branch.
    return kept.length === messages.length ? undefined : { messages: kept };
  }

  #noticeVisible(details: unknown, ctx: ExtensionContext): boolean {
    const target = readNoticeTarget(details);
    if (!target) return false;
    const { batchId, taskIds } = target;
    this.#manager = ctx.sessionManager;
    const record = this.#batches.get(batchId);
    if (!record || !this.#onBranch(record.batch)) return false;
    const collected = new Set<string>();
    for (const entry of ctx.sessionManager.getBranch()) {
      const result = readResultCollection(entry);
      if (result?.batchId === batchId) for (const taskId of result.taskIds) collected.add(taskId);
    }
    return record.batch.handle
      .snapshot()
      .results.some((task) => taskIds.includes(task.taskId) && !collected.has(task.taskId));
  }

  /** Bind only the current parent operation; normal completion does not stop children. */
  observeParent(signal?: AbortSignal): void {
    if (this.#closed || !signal || signal === this.#parentSignal) return;
    this.#removeParentAbort?.();
    this.#parentSignal = signal;
    const abort = () => this.#abortParent();
    signal.addEventListener("abort", abort, { once: true });
    this.#removeParentAbort = () => signal.removeEventListener("abort", abort);
    if (signal.aborted) abort();
  }

  /** Stop every owned batch, including post-result assessments, and pause notice delivery. */
  #abortParent(): void {
    this.#paused = true;
    clearTimeout(this.#noticeTimer);
    this.#noticeTimer = undefined;
    for (const { batch } of this.#batches.values()) {
      void batch.handle.stop().catch(() => undefined);
    }
  }

  /** Release operation listeners only after final parent settlement. */
  settleParent(aborted: boolean, ctx: ExtensionContext): void {
    if (aborted) this.#abortParent();
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

  /** Close admission and await owned cleanup before releasing session state. */
  async close(): Promise<void> {
    this.#closed = true;
    this.#shutdown.abort();
    this.#removeParentAbort?.();
    clearTimeout(this.#noticeTimer);
    // Fence existing runs immediately; pending startup must not delay their cancellation.
    const stopping = [...this.#batches.values()].map(({ batch }) => batch.handle.stop());
    await Promise.allSettled([...this.#starting, ...stopping]);
    // Include handles whose already-accepted startup finished while shutdown began.
    const batches = [...this.#batches.values()].map((record) => record.batch);
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
      const result = readResultCollection(entry);
      if (!result) continue;
      const record = this.#batches.get(result.batchId);
      if (record) for (const taskId of result.taskIds) record.notified.add(taskId);
    }
  }

  #updateUsage(record?: BatchRecord): void {
    if (this.#closed || record?.batch.mode !== "background") return;
    const { handle } = record.batch;
    for (const task of handle.snapshot().results) {
      const runKey = handle.runKeys.get(task.taskId);
      if (runKey && task.usage)
        this.registry.setDisplayResult(runKey, {
          display: {
            usageStatus: this.#receipts.reported(handle.batchId, task.taskId)
              ? "reported"
              : "uncollected",
          },
        });
    }
  }

  #onBranch(batch: Pick<RunBatch, "launchId">): boolean {
    return (
      !!batch.launchId && !!this.#manager?.getBranch().some((entry) => entry.id === batch.launchId)
    );
  }

  #scheduleNotice(): void {
    if (this.#closed || this.#paused || this.#noticeTimer) return;
    this.#noticeTimer = setTimeout(() => {
      this.#noticeTimer = undefined;
      if (this.#closed || this.#paused || this.#parentSignal?.aborted) return;
      for (const record of this.#batches.values()) this.#deliverNotice(record);
    }, 0);
  }

  #deliverNotice(record: BatchRecord): void {
    const { batch, owner } = record;
    if (
      batch.mode !== "background" ||
      record.abandoned ||
      !record.acknowledged ||
      (owner.options.noticeGranularity === "batch" && !record.complete) ||
      !this.#onBranch(batch)
    )
      return;
    const ready = batch.handle
      .snapshot()
      .results.filter((task) => task.status !== "canceled" && !record.notified.has(task.taskId));
    if (!ready.length) return;
    for (const task of ready) record.notified.add(task.taskId);
    sendCompletionNotice(owner.pi, owner.options, batch.handle.batchId, ready);
  }
}
