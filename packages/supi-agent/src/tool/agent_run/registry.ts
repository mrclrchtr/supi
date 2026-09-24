import { randomUUID } from "node:crypto";
import type { Usage } from "@earendil-works/pi-ai";
import type {
  AgentRunProgress,
  AgentRunSteerResult,
  AgentRunToolRenderer,
} from "@mrclrchtr/supi-agent-runtime/api";
import type { AgentConversationView } from "./conversation-view.ts";
import type {
  ActiveRunRegistration,
  ActiveRunSnapshot,
  AgentRunRegistrySnapshot,
  AgentRunStopResult,
  BatchTaskResult,
  CompletedBatch,
} from "./registry-types.ts";

export type {
  ActiveRunRegistration,
  ActiveRunSnapshot,
  AgentRunRegistrySnapshot,
  AgentRunStopResult,
  BatchProgressState,
  BatchTaskProgress,
  BatchTaskResult,
  BatchTaskStatus,
  CompletedBatch,
} from "./registry-types.ts";

import {
  AgentRunTranscriptCapture,
  type AgentRunTranscriptMetadata,
  AgentRunTranscriptStore,
} from "./transcript-store.ts";

interface ActiveRun extends ActiveRunRegistration {
  runKey: string;
  batchId: string;
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
  #batches: CompletedBatch[] = [];
  #lastBatch: CompletedBatch | undefined;
  #batchSharedContexts = new Map<string, string | undefined>();
  #activeBatchId: string | undefined;
  #sessionGeneration = 0;
  #sessionOpen = true;
  #batchGenerations = new Map<string, number>();
  #transcriptStore = new AgentRunTranscriptStore();

  /** Start one batch-level metadata scope before its Agent Runs register. */
  beginBatch(sharedContext?: string): string {
    const batchId = randomUUID();
    this.#batchGenerations.set(batchId, this.#sessionOpen ? this.#sessionGeneration : -1);
    if (this.#sessionOpen) {
      this.#batchSharedContexts.set(batchId, sharedContext);
      this.#activeBatchId = batchId;
      this.#publish();
    }
    return batchId;
  }

  /** Open registry writes for a new parent session. */
  openSession(): void {
    this.#sessionOpen = true;
  }

  /** Start one temporary transcript without affecting Agent Run execution. */
  createTranscriptCapture(
    metadata: AgentRunTranscriptMetadata,
    systemPrompt = "",
    toolRenderers: readonly AgentRunToolRenderer[] = [],
  ): AgentRunTranscriptCapture {
    if (this.#isBatchClosed(metadata.batchId)) {
      return new AgentRunTranscriptCapture({
        metadata,
        systemPrompt,
        toolRenderers,
        getDirectory: async () => {
          throw new Error("The parent session is closed.");
        },
      });
    }
    return this.#transcriptStore.createCapture(metadata, systemPrompt, toolRenderers, () =>
      this.#publish(),
    );
  }

  /** Register one active run with the human-facing metadata needed by the overlay. */
  register(registration: ActiveRunRegistration): void {
    const runKey = registration.runKey ?? registration.taskId;
    const batchId = registration.batchId ?? this.#activeBatchId ?? "default";
    if (this.#isBatchClosed(batchId)) {
      void registration.handle.stop().catch(() => undefined);
      return;
    }
    this.#removeActive(runKey);
    const run: ActiveRun = {
      ...registration,
      runKey,
      batchId,
      progress: { status: "starting", turns: 0, toolUses: 0, toolErrors: 0 },
      acceptedSteering: [],
    };
    this.#active.set(runKey, run);
    run.unsubscribe = registration.handle.subscribe((progress) => {
      run.progress = progress;
      this.#publish();
    });
    this.#publish();
  }

  /** Record the final Conversation View for one task. */
  setConversationView(runKey: string, view: AgentConversationView): void {
    if (!this.#active.has(runKey)) return;
    this.#conversationViews.set(runKey, view);
    this.#publish();
  }

  /** Notify viewers that live conversation evidence changed. */
  refresh(): void {
    this.#publish();
  }

  /** Settle one run's result and remove it from active runs. */
  settle(runKey: string): void {
    this.#removeActive(runKey);
    this.#publish();
  }

  /** Finalize the current batch as the last completed batch. */
  completeBatch(
    results: readonly BatchTaskResult[],
    sharedContext?: string,
    aggregateUsage?: Usage,
    batchId = this.#activeBatchId ?? "default",
  ): CompletedBatch {
    if (this.#isBatchClosed(batchId)) {
      this.#batchGenerations.delete(batchId);
      return {
        batchId,
        tasks: results,
        sharedContext,
        aggregateUsage,
        conversationViews: {},
        runKeys: Object.fromEntries(results.map((result) => [result.taskId, result.taskId])),
        transcriptSources: {},
      };
    }
    const runs = [...this.#active.values()].filter((run) => run.batchId === batchId);
    const runKeyByTask = new Map(runs.map((run) => [run.taskId, run.runKey]));
    const runKeys = Object.fromEntries(
      results.map((result) => [result.taskId, runKeyByTask.get(result.taskId) ?? result.taskId]),
    );
    const batch: CompletedBatch = {
      batchId,
      tasks: results,
      sharedContext: this.#batchSharedContexts.get(batchId) ?? sharedContext,
      aggregateUsage,
      conversationViews: Object.fromEntries(
        results.flatMap((result) => {
          const runKey = runKeys[result.taskId];
          const view = runKey ? this.#conversationViews.get(runKey) : undefined;
          return view ? [[result.taskId, view]] : [];
        }),
      ),
      runKeys,
      transcriptSources: Object.fromEntries(
        runs.flatMap((run) => (run.transcript ? [[run.runKey, run.transcript]] : [])),
      ),
    };
    this.#batches.push(batch);
    this.#lastBatch = batch;
    for (const run of runs) this.#removeActive(run.runKey);
    this.#batchSharedContexts.delete(batchId);
    this.#batchGenerations.delete(batchId);
    this.#activeBatchId = [...this.#batchSharedContexts.keys()].at(-1);
    for (const run of runs) this.#conversationViews.delete(run.runKey);
    this.#publish();
    return batch;
  }

  /** Return a bounded inspection snapshot for the overlay. */
  snapshot(): AgentRunRegistrySnapshot {
    const activeBatchId = this.#active.values().next().value?.batchId ?? this.#activeBatchId;
    return {
      activeRuns: [...this.#active.values()].map((run) => this.#snapshotRun(run)),
      ...(activeBatchId && this.#batchSharedContexts.get(activeBatchId) !== undefined
        ? { activeSharedContext: this.#batchSharedContexts.get(activeBatchId) }
        : {}),
      batches: [...this.#batches],
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
  async steer(runKey: string, message: string): Promise<AgentRunSteerResult> {
    const run = this.#active.get(runKey);
    if (run?.progress.status !== "running") return "not-running";
    const result = await run.handle.steer(message);
    if (result === "accepted") {
      run.acceptedSteering.push(message);
      this.#publish();
    }
    return result;
  }

  /** Return steering accepted through the overlay for final Conversation View retention. */
  acceptedSteering(runKey: string): readonly string[] {
    return [...(this.#active.get(runKey)?.acceptedSteering ?? [])];
  }

  /** Stop only the selected starting or running Agent Run. */
  async stop(runKey: string): Promise<AgentRunStopResult> {
    const run = this.#active.get(runKey);
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
    this.#batchSharedContexts.clear();
    this.#activeBatchId = undefined;
    this.#publish();
  }

  /** Clear session state and remove temporary transcript files. */
  async clear(): Promise<void> {
    this.#sessionOpen = false;
    this.#sessionGeneration++;
    this.#clearActive();
    this.#conversationViews.clear();
    this.#batches = [];
    this.#lastBatch = undefined;
    this.#batchSharedContexts.clear();
    this.#activeBatchId = undefined;
    const transcriptStore = this.#transcriptStore;
    this.#transcriptStore = new AgentRunTranscriptStore();
    await transcriptStore.dispose();
    this.#publish();
  }

  #isBatchClosed(batchId: string): boolean {
    const generation = this.#batchGenerations.get(batchId);
    return (
      !this.#sessionOpen || (generation !== undefined && generation !== this.#sessionGeneration)
    );
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
      runKey: run.runKey,
      batchId: run.batchId,
      ...(run.transcript ? { transcriptSource: run.transcript } : {}),
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

  #removeActive(runKey: string): void {
    const run = this.#active.get(runKey);
    run?.unsubscribe?.();
    this.#active.delete(runKey);
  }

  #clearActive(): void {
    for (const run of this.#active.values()) run.unsubscribe?.();
    this.#active.clear();
  }
}
