import type { Usage } from "@earendil-works/pi-ai";
import type { AgentRunHandle } from "@mrclrchtr/supi-agent-runtime/api";
import type { AgentConversationView } from "./conversation-view.ts";

// ── Domain types ─────────────────────────────────────────────────

/** Per-task status tracked during live execution. */
export type BatchTaskStatus = "running" | "completed" | "failed" | "canceled" | "timeout";

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

/** Internal tracking for one active Agent Run. */
interface ActiveRun {
  taskId: string;
  handle: AgentRunHandle<string>;
}

/** Session-local registry of active and completed Agent Runs. */
export class AgentRunRegistry {
  #active = new Map<string, ActiveRun>();
  #conversationViews = new Map<string, AgentConversationView>();
  #lastBatch: CompletedBatch | undefined;

  /** Register a new active run. The caller must later settle when the run completes. */
  register(taskId: string, handle: AgentRunHandle<string>): void {
    this.#active.set(taskId, { taskId, handle });
  }

  /** Record the conversation view for a task, independent of active-run state. */
  setConversationView(taskId: string, view: AgentConversationView): void {
    this.#conversationViews.set(taskId, view);
  }

  /** Settle one run's result and remove it from active runs. */
  settle(taskId: string): void {
    this.#active.delete(taskId);
  }

  /** Finalize the current batch as the last completed batch. */
  completeBatch(
    results: readonly BatchTaskResult[],
    sharedContext?: string,
    aggregateUsage?: Usage,
  ): CompletedBatch {
    const conversationViews = Object.fromEntries(this.#conversationViews);
    const batch: CompletedBatch = {
      tasks: results,
      sharedContext,
      aggregateUsage,
      conversationViews,
    };
    this.#lastBatch = batch;
    this.#active.clear();
    this.#conversationViews.clear();
    return batch;
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
    const stops = [...this.#active.values()].map((run) => run.handle.stop());
    await Promise.allSettled(stops);
    this.#active.clear();
  }

  /** Clear all state on session shutdown. */
  clear(): void {
    this.#active.clear();
    this.#conversationViews.clear();
    this.#lastBatch = undefined;
  }
}
