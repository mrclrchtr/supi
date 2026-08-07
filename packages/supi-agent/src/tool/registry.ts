import type { ModelThinkingLevel, Usage } from "@earendil-works/pi-ai";
import type {
  AgentRunHandle,
  AgentRunProgress,
  AgentRunSteerResult,
} from "@mrclrchtr/supi-agent-runtime/api";
import type { AgentConversationView, ConversationTaskMetadata } from "./conversation-view.ts";

/** Per-task status tracked during live execution. */
export type BatchTaskStatus = AgentRunProgress["status"];

/** Live progress for one Delegation Task. */
export interface BatchTaskProgress {
  taskId: string;
  profileId: string;
  status: BatchTaskStatus;
  turns: number;
  toolUses: number;
  usage?: Usage;
  recentActivity?: readonly string[];
  modelId?: string;
  thinkingLevel?: ModelThinkingLevel;
}

/** Live progress for one Delegation Batch. */
export interface BatchProgressState {
  tasks: readonly BatchTaskProgress[];
  completedCount: number;
  totalCount: number;
}

/** Public view of one task's execution outcome. */
export interface BatchTaskResult {
  taskId: string;
  profileId: string;
  status: BatchTaskStatus;
  /** Model-facing final assistant text, capped. */
  finalText?: string;
  /** Human-facing full final text, capped. */
  finalTextFull?: string;
  humanTruncated: boolean;
  modelTruncated: boolean;
  usage?: Usage;
  /** Failure stage for non-success outcomes. */
  failureCode?: string;
  /** Turns executed. */
  turns: number;
  /** Tool uses executed. */
  toolUses: number;
  /** Effective provider/model ID used by the child session. */
  modelId?: string;
  /** Effective thinking level used by the child session. */
  thinkingLevel?: ModelThinkingLevel;
  /** Initial task metadata kept separate from the Conversation View. */
  taskMetadata?: ConversationTaskMetadata;
}

/** Public view of one completed batch. */
export interface CompletedBatch {
  tasks: readonly BatchTaskResult[];
  sharedContext?: string;
  /** Aggregate usage across all started runs. */
  aggregateUsage?: Usage;
  /** Per-task bounded conversation views retained for inspection. */
  conversationViews: Record<string, AgentConversationView>;
}

/** Metadata needed to inspect and control one active Agent Run. */
export interface ActiveRunRegistration {
  taskId: string;
  profileId: string;
  modelId: string;
  thinkingLevel: ModelThinkingLevel;
  taskMetadata: ConversationTaskMetadata;
  handle: AgentRunHandle<string>;
  getConversationView: (acceptedSteering: readonly string[]) => AgentConversationView;
  getRecentActivity?: () => readonly string[];
}

/** Immutable inspection view of one active Agent Run. */
export interface ActiveRunSnapshot extends BatchTaskProgress {
  modelId: string;
  thinkingLevel: ModelThinkingLevel;
  taskMetadata: ConversationTaskMetadata;
  conversationView: AgentConversationView;
}

/** Current session-local state exposed to the /agents overlay. */
export interface AgentRunRegistrySnapshot {
  activeRuns: readonly ActiveRunSnapshot[];
  activeSharedContext?: string;
  lastBatch?: CompletedBatch;
}

/** Result of one selected-run stop request. */
export type AgentRunStopResult = "accepted" | "not-running";

interface ActiveRun extends ActiveRunRegistration {
  progress: AgentRunProgress;
  acceptedSteering: string[];
  unsubscribe?: () => void;
}

type RegistryListener = (snapshot: AgentRunRegistrySnapshot) => void;

/** Session-local registry of active and completed Agent Runs. */
export class AgentRunRegistry {
  #active = new Map<string, ActiveRun>();
  #conversationViews = new Map<string, AgentConversationView>();
  #listeners = new Set<RegistryListener>();
  #lastBatch: CompletedBatch | undefined;
  #activeSharedContext: string | undefined;

  /** Start one batch-level metadata scope before its Agent Runs register. */
  beginBatch(sharedContext?: string): void {
    this.#activeSharedContext = sharedContext;
    this.#publish();
  }

  /** Register one active run with the human-facing metadata needed by the overlay. */
  register(registration: ActiveRunRegistration): void {
    this.#removeActive(registration.taskId);
    const run: ActiveRun = {
      ...registration,
      progress: { status: "starting", turns: 0, toolUses: 0, toolErrors: 0 },
      acceptedSteering: [],
    };
    this.#active.set(registration.taskId, run);
    run.unsubscribe = registration.handle.subscribe((progress) => {
      run.progress = progress;
      this.#publish();
    });
    this.#publish();
  }

  /** Record the final Conversation View for one task. */
  setConversationView(taskId: string, view: AgentConversationView): void {
    this.#conversationViews.set(taskId, view);
    this.#publish();
  }

  /** Notify viewers that live conversation evidence changed. */
  refresh(): void {
    this.#publish();
  }

  /** Settle one run's result and remove it from active runs. */
  settle(taskId: string): void {
    this.#removeActive(taskId);
    this.#publish();
  }

  /** Finalize the current batch as the last completed batch. */
  completeBatch(
    results: readonly BatchTaskResult[],
    sharedContext?: string,
    aggregateUsage?: Usage,
  ): CompletedBatch {
    const batch: CompletedBatch = {
      tasks: results,
      sharedContext,
      aggregateUsage,
      conversationViews: Object.fromEntries(this.#conversationViews),
    };
    this.#lastBatch = batch;
    this.#clearActive();
    this.#activeSharedContext = undefined;
    this.#conversationViews.clear();
    this.#publish();
    return batch;
  }

  /** Return a bounded inspection snapshot for the overlay. */
  snapshot(): AgentRunRegistrySnapshot {
    return {
      activeRuns: [...this.#active.values()].map((run) => this.#snapshotRun(run)),
      ...(this.#activeSharedContext === undefined
        ? {}
        : { activeSharedContext: this.#activeSharedContext }),
      lastBatch: this.#lastBatch,
    };
  }

  /** Observe registry changes; the current snapshot is delivered immediately. */
  subscribe(listener: RegistryListener): () => void {
    this.#listeners.add(listener);
    try {
      listener(this.snapshot());
    } catch {
      // Overlay failures must not change Agent Run lifecycle semantics.
    }
    return () => this.#listeners.delete(listener);
  }

  /** Queue steering for one selected running Agent Run. */
  async steer(taskId: string, message: string): Promise<AgentRunSteerResult> {
    const run = this.#active.get(taskId);
    if (run?.progress.status !== "running") return "not-running";
    const result = await run.handle.steer(message);
    if (result === "accepted") {
      run.acceptedSteering.push(message);
      this.#publish();
    }
    return result;
  }

  /** Return steering accepted through the overlay for final Conversation View retention. */
  acceptedSteering(taskId: string): readonly string[] {
    return [...(this.#active.get(taskId)?.acceptedSteering ?? [])];
  }

  /** Stop only the selected starting or running Agent Run. */
  async stop(taskId: string): Promise<AgentRunStopResult> {
    const run = this.#active.get(taskId);
    if (!run || (run.progress.status !== "starting" && run.progress.status !== "running")) {
      return "not-running";
    }
    run.progress = { ...run.progress, status: "stopping" };
    this.#publish();
    await run.handle.stop();
    return "accepted";
  }

  /** Whether any runs are still active. */
  hasActive(): boolean {
    return this.#active.size > 0;
  }

  /** The last completed batch, if any. */
  lastBatch(): CompletedBatch | undefined {
    return this.#lastBatch;
  }

  /** Stop all active runs and await their settlement. */
  async cancelAll(): Promise<void> {
    await Promise.allSettled([...this.#active.values()].map((run) => run.handle.stop()));
    this.#clearActive();
    this.#activeSharedContext = undefined;
    this.#publish();
  }

  /** Clear active and last-batch state on session shutdown. */
  clear(): void {
    this.#clearActive();
    this.#conversationViews.clear();
    this.#lastBatch = undefined;
    this.#activeSharedContext = undefined;
    this.#publish();
  }

  #snapshotRun(run: ActiveRun): ActiveRunSnapshot {
    let conversationView: AgentConversationView;
    try {
      conversationView = run.getConversationView([...run.acceptedSteering]);
    } catch {
      conversationView = {
        taskId: run.taskId,
        profileId: run.profileId,
        entries: [],
        omittedEntryCount: 0,
        omittedCharacterCount: 0,
        textTruncated: false,
        taskMetadata: run.taskMetadata,
      };
    }
    return {
      taskId: run.taskId,
      profileId: run.profileId,
      status: run.progress.status,
      turns: run.progress.turns,
      toolUses: run.progress.toolUses,
      usage: run.progress.usage,
      recentActivity: run.getRecentActivity?.(),
      modelId: run.modelId,
      thinkingLevel: run.thinkingLevel,
      taskMetadata: run.taskMetadata,
      conversationView,
    };
  }

  #publish(): void {
    if (this.#listeners.size === 0) return;
    const snapshot = this.snapshot();
    for (const listener of this.#listeners) {
      try {
        listener(snapshot);
      } catch {
        // Overlay failures must not change Agent Run lifecycle semantics.
      }
    }
  }

  #removeActive(taskId: string): void {
    const run = this.#active.get(taskId);
    run?.unsubscribe?.();
    this.#active.delete(taskId);
  }

  #clearActive(): void {
    for (const run of this.#active.values()) run.unsubscribe?.();
    this.#active.clear();
  }
}
