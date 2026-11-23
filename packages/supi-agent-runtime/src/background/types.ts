import type { Usage } from "@earendil-works/pi-ai";
import type {
  AgentToolResult,
  ExtensionContext,
  SessionEntry,
  Theme,
  ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import type { AgentRunStatus } from "../types.ts";

/** Minimal view of one finalized task in a Run Batch. Owners add their own result fields. */
export interface RunBatchTask {
  readonly taskId: string;
  /** Terminal status. Canceled tasks never produce a Completion Notice. */
  readonly status: AgentRunStatus;
  /** Usage that the first stored Result Collection reports to the parent. */
  readonly usage?: Usage;
}

/** Owner-provided control surface for one started Run Batch. */
export interface RunBatchHandle<TTask extends RunBatchTask = RunBatchTask> {
  readonly batchId: string;
  /** Agent Run Registry run keys by task ID; `/agents` shows uncollected Usage through them. */
  readonly runKeys: ReadonlyMap<string, string>;
  /** Settles after every task in the batch is terminal. */
  readonly result: Promise<unknown>;
  /** Return the tasks that already have a finalized result, in the owner's order. */
  snapshot(): { readonly results: readonly TTask[] };
  /** Stop every active run of the batch. Repeated calls share one cleanup. */
  stop(): Promise<void>;
}

/** Task type carried by a Run Batch handle. */
export type RunBatchTaskOf<THandle extends RunBatchHandle> = ReturnType<
  THandle["snapshot"]
>["results"][number];

/** Whether the caller waits for the batch (`foreground`) or continues before it ends (`background`). */
export type RunBatchMode = "foreground" | "background";

/** One session-owned Run Batch with its launch identity and owner data. */
export interface RunBatch<THandle extends RunBatchHandle = RunBatchHandle, TData = undefined> {
  readonly handle: THandle;
  readonly mode: RunBatchMode;
  /** Launching tool call. Its stored, successful result acknowledges the launch. */
  readonly callId: string;
  /** Session entry of the launching assistant message; it defines branch ownership. */
  readonly launchId?: string;
  /** Owner-defined data. The runtime does not read it. */
  readonly data: TData;
}

/** The `details` fields of a Completion Notice that identify its batch and tasks. */
export interface CompletionNoticeTarget {
  readonly batchId: string;
  readonly taskIds: readonly string[];
}

/** Owner-built Completion Notice. Its content must carry no task output and no Usage. */
export interface CompletionNotice {
  readonly content: string;
  /** Show the notice in the TUI; defaults to `true`. */
  readonly display?: boolean;
  /** TUI-only details. They must include the batch ID and the notified task IDs. */
  readonly details: CompletionNoticeTarget;
}

/**
 * When the runtime sends Completion Notices: `task` sends one for the tasks that became ready since
 * the last notice (Delegation); `batch` sends a single notice once every task is terminal.
 */
export type CompletionNoticeGranularity = "task" | "batch";

/** Renderer of one collection tool result; `context` is Pi's tool render context. */
export type RunBatchResultRenderer = (
  result: AgentToolResult<unknown>,
  options: ToolRenderResultOptions,
  theme: Theme,
  context: { readonly isError?: boolean },
) => Component;

/**
 * An owner's part of Result Collection through the runtime-owned `agent_result` and
 * `agent_cancel` tools. The runtime resolves the addressed batch, rejects unknown, expired, and
 * off-branch handles, waits, revalidates, and reserves Usage; the owner formats and renders.
 */
export interface RunBatchCollection<
  THandle extends RunBatchHandle = RunBatchHandle,
  TData = undefined,
> {
  /**
   * Assemble one collection result after waiting and revalidation, before Usage is reserved. Its
   * `details` must carry `batchId` and `tasks[].taskId` (see `readResultCollection()`). Owner
   * records that Pi must store with the result, such as checkpoints, are prepared here.
   */
  collect(
    callId: string,
    batch: RunBatch<THandle, TData>,
    ctx: ExtensionContext,
  ): AgentToolResult<Record<string, unknown>>;
  /**
   * Format the result of a cancellation request. `requested` is true when active runs remained;
   * the runtime requests their stop after this call.
   */
  cancel(
    batch: RunBatch<THandle, TData>,
    request: { readonly requested: boolean },
    ctx: ExtensionContext,
  ): AgentToolResult<unknown>;
  /** Partial result streamed while `agent_result` waits; repeated equal `details` are skipped. */
  progress?(batch: RunBatch<THandle, TData>): AgentToolResult<Record<string, unknown>>;
  /** Render this owner's partial and final `agent_result` results. Errors are runtime-rendered. */
  renderResult: RunBatchResultRenderer;
  /** Render this owner's `agent_cancel` results. Errors are runtime-rendered. */
  renderCancel: RunBatchResultRenderer;
  /** Model-facing errors when the caller cancels a wait or a collection after it. */
  readonly canceledMessages?: { readonly wait?: string; readonly collection?: string };
  /**
   * Whether this owner currently needs `agent_result` and `agent_cancel` active; defaults to
   * true. The tools are deactivated only while no registered owner needs them. Call
   * {@link RunBatchOwner.syncCollectionTools} when the answer changes.
   */
  toolsNeeded?(): boolean;
}

/** A batch resolved for Result Collection, with the collection of its owner. Runtime-internal. */
export interface CollectableRunBatch {
  readonly batch: RunBatch<RunBatchHandle, unknown>;
  readonly collection: RunBatchCollection<RunBatchHandle, unknown>;
  /** Stable owner key; stamped into collection results so stored results render by owner. */
  readonly ownerKey: string;
}

/** Owner policy that the runtime applies to every batch the owner hands over. */
export interface RunBatchOwnerOptions<
  THandle extends RunBatchHandle = RunBatchHandle,
  TData = undefined,
> {
  /** Debug-event source of the owner package, such as `supi-agent`. */
  readonly source: string;
  /**
   * Custom message type of this owner's Completion Notices. The runtime sends notices with this
   * type and drops stale stored notices of this type from model context.
   */
  readonly noticeType: string;
  /** Build one Completion Notice for the tasks of a batch that became ready since the last one. */
  buildNotice(batchId: string, tasks: readonly RunBatchTaskOf<THandle>[]): CompletionNotice;
  /** Completion Notice granularity; defaults to `task`. */
  readonly noticeGranularity?: CompletionNoticeGranularity;
  /**
   * Serve this owner's batches through the runtime-owned `agent_result` and `agent_cancel`. The
   * first owner that supplies it registers both tools once for the Pi runtime.
   */
  readonly collection?: RunBatchCollection<THandle, TData>;
  /**
   * Reconcile owner state with the raw active branch before a collection (`releaseUnstored`
   * false) and after tree navigation or a parent turn (`releaseUnstored` true), when collection
   * claims that Pi has not stored can be released.
   */
  reconcile?(branch: readonly SessionEntry[], releaseUnstored: boolean): void;
}

/** Session controls passed to an owner while it starts a batch. */
export interface RunBatchStartControl {
  /** Aborts on the caller signal or when the session closes. */
  readonly signal: AbortSignal;
  /** False once the session is closed; owners must not start runs afterwards. */
  isOpen(): boolean;
  /** Report that a task of the batch reached its result; this schedules a Completion Notice. */
  taskSettled(batchId: string): void;
}

/** Inputs of {@link RunBatchOwner.start}. */
export interface StartRunBatchOptions<THandle extends RunBatchHandle, TData> {
  /** Launching tool call. */
  readonly callId: string;
  readonly mode: RunBatchMode;
  /** Launch entry from {@link RunBatchOwner.findLaunch}; required for background batches. */
  readonly launchId?: string;
  readonly data: TData;
  /** Caller cancellation for startup; combined with session shutdown in `control.signal`. */
  readonly signal?: AbortSignal;
  /**
   * Start the admitted batch. `settled` covers startup work that can outlive a rejected `result`;
   * session close awaits both.
   */
  begin(control: RunBatchStartControl): {
    readonly result: Promise<THandle>;
    readonly settled?: Promise<void>;
  };
}

/** Identity for Usage prepared by a Result Collection, outside model context. */
export interface RunBatchUsageReceipt {
  readonly token: string;
  readonly batchId: string;
  readonly taskIds: readonly string[];
}

/**
 * One owner's access to the Run Batches of the containing session. The runtime owns session and
 * launch-branch ownership, Completion Notices, parent-abort handling, waiting, Usage receipts,
 * retained spill files, and shutdown. The owner keeps admission policy and its result format.
 */
export interface RunBatchOwner<THandle extends RunBatchHandle = RunBatchHandle, TData = undefined> {
  /** Bind the parent context and observe its operation. Returns false once the session is closed. */
  open(ctx: ExtensionContext): boolean;
  /** Find the launching assistant entry of a tool call on the active branch. */
  findLaunch(callId: string, ctx: ExtensionContext): string | undefined;
  /** Hand an admitted batch to the session. Resolves with the batch once startup returns its handle. */
  start(options: StartRunBatchOptions<THandle, TData>): Promise<RunBatch<THandle, TData>>;
  /** This owner's foreground and background batches in the session. */
  batches(): RunBatch<THandle, TData>[];
  /** Whether the batch's launch is on the active branch. */
  isOnBranch(batch: RunBatch<THandle, TData>): boolean;
  /** Whether Pi stored this task's Usage in a collection result. */
  usageReported(batch: RunBatch<THandle, TData>, taskId: string): boolean;
  /** Delete an internally generated spill file and its directory when the session closes. */
  retainOutput(path: string | undefined): void;
  /** Reapply the activation of `agent_result` and `agent_cancel` after `toolsNeeded()` changed. */
  syncCollectionTools(): void;
}
