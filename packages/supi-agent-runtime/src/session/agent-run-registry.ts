import { randomUUID } from "node:crypto";
import type { AgentRunHandle, AgentRunSessionView } from "../types.ts";
import type {
  AgentRunDisplayConversation,
  AgentRunDisplayMetadata,
  AgentRunDisplayResult,
  AgentRunRegistration,
  AgentRunRegistryRun,
  AgentRunRegistrySnapshot,
  AgentRunStopResult,
} from "./agent-run-registry-types.ts";
import {
  AgentRunTranscriptCapture,
  type AgentRunTranscriptMetadata,
  AgentRunTranscriptStore,
} from "./transcript-store.ts";

interface LiveRun {
  readonly handle: AgentRunHandle<unknown>;
  readonly getConversation?: AgentRunRegistration["getConversation"];
  readonly getRecentActivity?: AgentRunRegistration["getRecentActivity"];
  unsubscribeProgress?: () => void;
  unsubscribeSession?: () => void;
}

interface RegisteredRun {
  readonly runKey: string;
  readonly batchId: string;
  readonly generation: number;
  readonly metadata: AgentRunDisplayMetadata;
  readonly transcript?: AgentRunTranscriptCapture;
  readonly acceptedSteering: string[];
  live?: LiveRun;
  status: AgentRunRegistryRun["status"];
  turns: number;
  toolUses: number;
  usage?: AgentRunRegistryRun["usage"];
  conversation?: AgentRunDisplayConversation;
  recentActivity?: readonly string[];
  result?: AgentRunDisplayResult;
}

type RegistryListener = (snapshot: AgentRunRegistrySnapshot) => void;

/** Session-local registry and transcript owner for all managed Agent Runs. */
export class AgentRunRegistry {
  readonly #runs = new Map<string, RegisteredRun>();
  readonly #listeners = new Set<RegistryListener>();
  #sessionGeneration = 0;
  #sessionOpen = true;
  #transcriptStore = new AgentRunTranscriptStore();

  /** Open registry writes for a new containing session. */
  openSession(): void {
    this.#sessionOpen = true;
  }

  /** Start one temporary transcript without affecting Agent Run execution. */
  createTranscriptCapture(
    metadata: AgentRunTranscriptMetadata,
    systemPrompt = "",
    toolRenderers: AgentRunTranscriptCapture["toolRenderers"] = [],
  ): AgentRunTranscriptCapture {
    if (!this.#sessionOpen) {
      return new AgentRunTranscriptCapture({
        metadata,
        systemPrompt,
        toolRenderers,
        getDirectory: async () => {
          throw new Error("The containing session is closed.");
        },
      });
    }
    return this.#transcriptStore.createCapture(metadata, systemPrompt, toolRenderers, () =>
      this.#publish(),
    );
  }

  /** Register one run before its initial prompt starts. */
  register(registration: AgentRunRegistration): string {
    const runKey = registration.metadata.runKey ?? randomUUID();
    const batchId = registration.metadata.batchId ?? "default";
    if (!this.#sessionOpen) {
      void registration.handle.stop().catch(() => undefined);
      return runKey;
    }
    this.#remove(runKey);
    const live: LiveRun = {
      handle: registration.handle,
      ...(registration.getConversation ? { getConversation: registration.getConversation } : {}),
      ...(registration.getRecentActivity
        ? { getRecentActivity: registration.getRecentActivity }
        : {}),
    };
    const run: RegisteredRun = {
      runKey,
      batchId,
      generation: this.#sessionGeneration,
      metadata: {
        ...registration.metadata,
        runKey,
        batchId,
        tools: [...registration.metadata.tools],
      },
      ...(registration.transcript ? { transcript: registration.transcript } : {}),
      acceptedSteering: [],
      live,
      status: "starting",
      turns: 0,
      toolUses: 0,
    };
    this.#runs.set(runKey, run);
    live.unsubscribeProgress = registration.handle.subscribe((progress) => {
      if (!this.#isCurrent(run)) return;
      run.status = progress.status;
      run.turns = progress.turns;
      run.toolUses = progress.toolUses;
      run.usage = progress.usage;
      this.#publish();
    });
    void registration.handle.result.then(
      (outcome) => {
        if (!this.#isCurrent(run)) return;
        this.#finishRun(
          run,
          outcome.kind === "success" ? "completed" : outcome.kind,
          outcome.usage,
          outcome.kind === "failed" ? outcome.failureCode : undefined,
        );
      },
      () => {
        if (!this.#isCurrent(run)) return;
        this.#finishRun(run, "failed", undefined, "unexpected-runner-failure");
      },
    );
    this.#publish();
    return runKey;
  }

  /** Attach full transcript capture to a read-only child-session view. */
  attachSession(runKey: string, session: AgentRunSessionView): () => void {
    const run = this.#runs.get(runKey);
    if (!run || !this.#isCurrent(run)) return () => undefined;
    const live = run.live;
    if (!live) return () => undefined;
    const transcript = run.transcript;
    transcript?.updateSession(session.systemPrompt, session.getToolRenderers());
    const unsubscribe = session.subscribe((event) => {
      if (!this.#isCurrent(run)) return;
      transcript?.observe(event, session.systemPrompt, session.getToolRenderers());
      this.#publish();
    });
    live.unsubscribeSession?.();
    live.unsubscribeSession = unsubscribe;
    this.#publish();
    return () => {
      if (live.unsubscribeSession !== unsubscribe) return;
      live.unsubscribeSession = undefined;
      unsubscribe();
    };
  }

  /** Set caller-owned, human-only display details after the run settles. */
  setDisplayResult(runKey: string, result: AgentRunDisplayResult): void {
    const run = this.#runs.get(runKey);
    if (!run || !this.#isCurrent(run)) return;
    run.result = { ...run.result, ...result };
    this.#publish();
  }

  /** Notify the viewer after caller-owned live metadata changes. */
  refresh(): void {
    this.#publish();
  }

  /** Return the current session-local run list. */
  snapshot(): AgentRunRegistrySnapshot {
    return { runs: [...this.#runs.values()].map((run) => this.#snapshotRun(run)) };
  }

  /** Observe run changes; deliver the current snapshot at once. */
  subscribe(listener: RegistryListener): () => void {
    this.#listeners.add(listener);
    try {
      listener(this.snapshot());
    } catch {
      // Viewer failures must not change Agent Run lifecycle semantics.
    }
    return () => this.#listeners.delete(listener);
  }

  /** Queue steering only for the selected run during its initial active prompt. */
  async steer(runKey: string, message: string): Promise<"accepted" | "not-running"> {
    const run = this.#runs.get(runKey);
    const handle = run?.live?.handle;
    if (run?.status !== "running" || !handle?.steeringAvailable) {
      return "not-running";
    }
    const result = await handle.steer(message);
    if (
      result === "accepted" &&
      this.#isCurrent(run) &&
      run.status === "running" &&
      run.live?.handle === handle
    ) {
      run.acceptedSteering.push(message);
      this.#publish();
    }
    return result;
  }

  /** Return the steering messages accepted through the viewer. */
  acceptedSteering(runKey: string): readonly string[] {
    return [...(this.#runs.get(runKey)?.acceptedSteering ?? [])];
  }

  /** Stop only the selected active run. */
  async stop(runKey: string): Promise<AgentRunStopResult> {
    const run = this.#runs.get(runKey);
    const handle = run?.live?.handle;
    if (
      !run ||
      !handle ||
      (run.status !== "starting" && run.status !== "running") ||
      !this.#isCurrent(run)
    ) {
      return "not-running";
    }
    run.status = "stopping";
    this.#publish();
    await handle.stop();
    return "accepted";
  }

  /** Whether any registered run is still active. */
  hasActive(): boolean {
    return [...this.#runs.values()].some((run) => isActive(run.status));
  }

  /** Stop all active runs and wait for their bounded disposal. */
  async cancelAll(): Promise<void> {
    await Promise.allSettled(
      [...this.#runs.values()]
        .filter((run) => isActive(run.status))
        .flatMap((run) => (run.live ? [run.live.handle.stop()] : [])),
    );
  }

  /** Clear session state and remove all temporary transcript files. */
  async clear(): Promise<void> {
    this.#sessionOpen = false;
    this.#sessionGeneration++;
    const runs = [...this.#runs.values()];
    const activeHandles = runs.flatMap((run) =>
      isActive(run.status) && run.live ? [run.live.handle] : [],
    );
    this.#runs.clear();
    for (const run of runs) this.#releaseLive(run);
    await Promise.allSettled(activeHandles.map((handle) => handle.stop()));
    const store = this.#transcriptStore;
    this.#transcriptStore = new AgentRunTranscriptStore();
    await store.dispose();
    this.#publish();
  }

  #snapshotRun(run: RegisteredRun): AgentRunRegistryRun {
    const live = run.live;
    const conversation = live ? this.#readConversation(run) : run.conversation;
    const recentActivity = live ? this.#readRecentActivity(live) : run.recentActivity;
    return {
      ...run.metadata,
      runKey: run.runKey,
      batchId: run.batchId,
      active: isActive(run.status),
      status: run.status,
      steeringAvailable: run.status === "running" && (live?.handle.steeringAvailable ?? false),
      turns: run.turns,
      toolUses: run.toolUses,
      ...(run.usage ? { usage: run.usage } : {}),
      ...(recentActivity ? { recentActivity } : {}),
      ...(run.transcript ? { transcriptSource: run.transcript } : {}),
      ...(conversation ? { conversation } : {}),
      ...(run.result ? { result: run.result } : {}),
    };
  }

  #publish(): void {
    if (this.#listeners.size === 0) return;
    const snapshot = this.snapshot();
    for (const listener of this.#listeners) {
      try {
        listener(snapshot);
      } catch {
        // Viewer failures must not change Agent Run lifecycle semantics.
      }
    }
  }

  #isCurrent(run: RegisteredRun): boolean {
    return (
      this.#sessionOpen &&
      run.generation === this.#sessionGeneration &&
      this.#runs.get(run.runKey) === run
    );
  }

  #finishRun(
    run: RegisteredRun,
    status: AgentRunRegistryRun["status"],
    usage: AgentRunRegistryRun["usage"],
    failureCode?: string,
  ): void {
    run.status = status;
    run.usage = usage ?? run.usage;
    if (failureCode) run.result = { ...run.result, failureCode };
    if (run.live) {
      run.conversation = this.#readConversation(run);
      run.recentActivity = this.#readRecentActivity(run.live);
      this.#releaseLive(run);
    }
    this.#publish();
  }

  #readConversation(run: RegisteredRun): AgentRunDisplayConversation | undefined {
    try {
      const conversation = run.live?.getConversation?.([...run.acceptedSteering]);
      return conversation ? copyConversation(conversation) : undefined;
    } catch {
      return undefined;
    }
  }

  #readRecentActivity(live: LiveRun): readonly string[] | undefined {
    try {
      const activity = live.getRecentActivity?.();
      return activity ? [...activity] : undefined;
    } catch {
      return undefined;
    }
  }

  #releaseLive(run: RegisteredRun): void {
    run.acceptedSteering.length = 0;
    const live = run.live;
    if (!live) return;
    live.unsubscribeProgress?.();
    live.unsubscribeSession?.();
    run.live = undefined;
  }

  #remove(runKey: string): void {
    const previous = this.#runs.get(runKey);
    if (previous) this.#releaseLive(previous);
    this.#runs.delete(runKey);
  }
}

function isActive(status: AgentRunRegistryRun["status"]): boolean {
  return status === "starting" || status === "running" || status === "stopping";
}

function copyConversation(conversation: AgentRunDisplayConversation): AgentRunDisplayConversation {
  return {
    entries: conversation.entries.map((entry) => ({ ...entry })),
    omittedEntryCount: conversation.omittedEntryCount,
    omittedCharacterCount: conversation.omittedCharacterCount,
    textTruncated: conversation.textTruncated,
  };
}
