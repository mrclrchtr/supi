import { randomUUID } from "node:crypto";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import type { AgentRunContext } from "@mrclrchtr/supi-agent-runtime/api";
import type { BatchTaskProgress, BatchTaskResult } from "../tool/agent_run/batch-types.ts";
import type { AgentRunTaskInput } from "../tool/agent_run/schema.ts";
import { AGENT_RESULT_TOOL_NAME } from "../tool/names.ts";
import type { DelegationCheckpoint } from "./checkpoints.ts";
import { readSavedDelegationConversations } from "./checkpoints.ts";
import type { ManagedBatch } from "./controller.ts";

function isTerminalStatus(status: BatchTaskProgress["status"]): boolean {
  return (
    status === "completed" || status === "failed" || status === "canceled" || status === "timeout"
  );
}

interface ConversationTarget {
  conversationId: string;
  label: string;
  profileId: string;
  parentCheckpointId: string | null;
  context?: AgentRunContext;
  previousRunStatus?: DelegationCheckpoint["runStatus"];
  previousFailureCode?: string;
}

/** A new or saved conversation target, or its preflight failure without Profile policy. */
export type ConversationTargetResult = ConversationTarget | { profileId: string; error: string };

/** List-safe saved/live conversation facts, without child context or current Profile policy. */
export interface DelegationConversationCandidate {
  readonly conversationId: string;
  readonly label?: string;
  readonly profileId?: string;
  readonly unavailableReason?: string;
  readonly hasSavedContext: boolean;
  readonly activity?: "busy" | "pending-collection";
}

/**
 * Resolve targets against one raw active branch during synchronous preflight.
 * Callers retain per-task Profile policy and error ordering. Never retain this resolver across
 * asynchronous startup: launch ownership and checkpoint lineage must be checked again afterward.
 */
export function createConversationTargetResolver(
  branch: readonly SessionEntry[],
): (task: AgentRunTaskInput) => ConversationTargetResult {
  const conversations = new Map(
    readSavedDelegationConversations(branch).conversations.map((entry) => [
      entry.conversationId,
      entry,
    ]),
  );
  return (task) => {
    if ("new" in task) {
      return {
        conversationId: randomUUID(),
        label: task.id,
        profileId: task.new.profile,
        parentCheckpointId: null,
      };
    }
    const conversationId = task.continue.conversationId;
    const saved = conversations.get(conversationId);
    if (!saved) {
      return {
        profileId: "(unknown)",
        error: `Unknown or off-branch conversation reference "${conversationId}". Use agent_list to see saved conversations on this branch.`,
      };
    }
    if (
      !saved.latest ||
      !saved.context ||
      !saved.profileId ||
      !saved.label ||
      saved.unavailableReason
    ) {
      return {
        profileId: saved.profileId ?? "(unavailable)",
        error: `Conversation "${conversationId}" cannot continue: ${saved.unavailableReason ?? "saved context is incomplete"}`,
      };
    }
    return {
      conversationId,
      label: saved.label,
      profileId: saved.profileId,
      parentCheckpointId: saved.latest.checkpointId,
      context: saved.context,
      previousRunStatus: saved.latest.runStatus,
      previousFailureCode: saved.latest.failureCode,
    };
  };
}

/** Own saved/live conversation interpretation, startup locks, and checkpoint payload claims. */
export class DelegationConversationState {
  readonly #checkpointClaims = new Map<string, string>();
  readonly #startingConversations = new Set<string>();

  /** Reserve conversation targets while the batch captures invocation-scoped authority. */
  reserveStarting(targets: readonly { readonly conversationId: string }[]): () => void {
    for (const target of targets) {
      if (this.#startingConversations.has(target.conversationId)) {
        throw new Error(`Conversation "${target.conversationId}" already has an active Agent Run.`);
      }
    }
    for (const target of targets) this.#startingConversations.add(target.conversationId);
    return () => {
      for (const target of targets) this.#startingConversations.delete(target.conversationId);
    };
  }

  /** Reconcile prepared checkpoint payloads with data stored on the active raw branch. */
  reconcile(branch: readonly SessionEntry[], releaseUnstored = false): void {
    const stored = readSavedDelegationConversations(branch).checkpointIds;
    for (const [checkpointId, callId] of this.#checkpointClaims) {
      if (stored.has(checkpointId) || releaseUnstored || hasToolResult(branch, callId)) {
        this.#checkpointClaims.delete(checkpointId);
      }
    }
  }

  /** Omit payloads already stored or claimed by another concurrent collection. */
  prepareCheckpointTasks(
    callId: string,
    batch: ManagedBatch,
    branch: readonly SessionEntry[],
  ): BatchTaskResult[] {
    this.reconcile(branch);
    const stored = readSavedDelegationConversations(branch).checkpointIds;
    return batch.handle.snapshot().results.map((task) => {
      const checkpoint = task.checkpoint as DelegationCheckpoint | undefined;
      if (!checkpoint) return task;
      if (
        stored.has(checkpoint.checkpointId) ||
        this.#checkpointClaims.has(checkpoint.checkpointId)
      ) {
        const { checkpoint: _checkpoint, ...withoutCheckpoint } = task;
        return withoutCheckpoint;
      }
      this.#checkpointClaims.set(checkpoint.checkpointId, callId);
      return task;
    });
  }

  /** Whether every available result and its checkpoint are stored on this branch. */
  isCollected(batch: ManagedBatch, branch: readonly SessionEntry[]): boolean {
    const results = batch.handle.snapshot().results;
    return (
      results.length > 0 &&
      results.every((task) => !hasPendingCollection(batch, task.taskId, branch))
    );
  }

  /** Merge saved conversations and live-only activity without exposing child context. */
  listCandidates(
    batches: Iterable<ManagedBatch>,
    branch: readonly SessionEntry[],
    isOnBranch: (batch: ManagedBatch) => boolean,
  ): readonly DelegationConversationCandidate[] {
    const conversations = new Map(
      readSavedDelegationConversations(branch).conversations.map((entry) => [
        entry.conversationId,
        entry,
      ]),
    );
    const activity = new Map<
      string,
      { status: "busy" | "pending-collection"; label: string; profileId: string }
    >();
    for (const batch of batches) {
      addBatchActivity(activity, batch, branch, !batch.launchId || isOnBranch(batch));
    }
    for (const [conversationId, live] of activity) {
      if (!conversations.has(conversationId)) {
        conversations.set(conversationId, {
          conversationId,
          label: live.label,
          profileId: live.profileId,
        });
      }
    }
    return [...conversations.values()].map((conversation) => ({
      conversationId: conversation.conversationId,
      label: conversation.label,
      profileId: conversation.profileId,
      unavailableReason: conversation.unavailableReason,
      hasSavedContext: Boolean(conversation.latest && conversation.context),
      activity: activity.get(conversation.conversationId)?.status,
    }));
  }

  /** Verify a captured invocation still targets the active branch before child startup. */
  assertCurrentBranch(
    targets: readonly {
      readonly conversationId: string;
      readonly parentCheckpointId: string | null;
    }[],
    launchId: string | undefined,
    branch: readonly SessionEntry[],
  ): void {
    if (launchId && !branch.some((entry) => entry.id === launchId)) {
      throw new Error("Delegation start canceled because its launch left the active branch.");
    }
    const conversations = new Map(
      readSavedDelegationConversations(branch).conversations.map((entry) => [
        entry.conversationId,
        entry,
      ]),
    );
    for (const target of targets) {
      if (target.parentCheckpointId === null) continue;
      const current = conversations.get(target.conversationId);
      if (current?.latest?.checkpointId !== target.parentCheckpointId) {
        throw new Error(
          `Conversation "${target.conversationId}" changed branches before its follow-up started.`,
        );
      }
    }
  }

  /** Reject conflicts before the controller starts any part of a batch. */
  assertAvailable(
    targets: readonly { taskId: string; conversationId: string }[],
    batches: Iterable<ManagedBatch>,
    branch: readonly SessionEntry[],
    isOnBranch: (batch: ManagedBatch) => boolean,
  ): void {
    const activeBatches = [...batches];
    for (const target of targets) {
      if (this.#startingConversations.has(target.conversationId)) {
        throw new Error(`Conversation "${target.conversationId}" already has an active Agent Run.`);
      }
      for (const batch of activeBatches) {
        const priorTaskId = [...batch.taskConversations].find(
          ([, conversationId]) => conversationId === target.conversationId,
        )?.[0];
        if (!priorTaskId) continue;
        const progress = batch.handle.progress().tasks.find((task) => task.taskId === priorTaskId);
        if (progress) {
          assertTaskAvailable({
            conversationId: target.conversationId,
            batch,
            taskId: priorTaskId,
            progress,
            branch,
            onBranch: !batch.launchId || isOnBranch(batch),
          });
        }
      }
    }
  }
}

function addBatchActivity(
  activity: Map<
    string,
    { status: "busy" | "pending-collection"; label: string; profileId: string }
  >,
  batch: ManagedBatch,
  branch: readonly SessionEntry[],
  onBranch: boolean,
): void {
  const progress = new Map(batch.handle.progress().tasks.map((task) => [task.taskId, task]));
  for (const [taskId, conversationId] of batch.taskConversations) {
    const task = progress.get(taskId);
    if (!task) continue;
    const liveDetails = { label: task.conversationLabel, profileId: task.profileId };
    if (!isTerminalStatus(task.status)) {
      activity.set(conversationId, { status: "busy", ...liveDetails });
    } else if (onBranch && hasPendingCollection(batch, taskId, branch)) {
      activity.set(conversationId, { status: "pending-collection", ...liveDetails });
    } else if (onBranch && hasUnstoredForegroundResult(batch, branch)) {
      activity.set(conversationId, { status: "busy", ...liveDetails });
    }
  }
}

function assertTaskAvailable(options: {
  readonly conversationId: string;
  readonly batch: ManagedBatch;
  readonly taskId: string;
  readonly progress: BatchTaskProgress;
  readonly branch: readonly SessionEntry[];
  readonly onBranch: boolean;
}): void {
  const { conversationId, batch, taskId, progress, branch, onBranch } = options;
  if (!isTerminalStatus(progress.status)) {
    throw new Error(`Conversation "${conversationId}" already has an active Agent Run.`);
  }
  if (!onBranch) return;
  if (hasPendingCollection(batch, taskId, branch)) {
    throw new Error(
      `Conversation "${conversationId}" has completed background work. Collect it with agent_result before continuing.`,
    );
  }
  if (batch.mode === "foreground" && !hasToolResult(branch, batch.callId)) {
    throw new Error(
      `Conversation "${conversationId}" has an Agent Run result that is not stored yet.`,
    );
  }
}

function hasPendingCollection(
  batch: ManagedBatch,
  taskId: string,
  branch: readonly SessionEntry[],
): boolean {
  if (batch.mode !== "background") return false;
  const collected = branch.some((entry) => {
    const collection = getSuccessfulCollection(entry);
    return collection?.batchId === batch.handle.batchId && collection.taskIds.includes(taskId);
  });
  if (!collected) return true;
  const checkpoint = batch.handle
    .snapshot()
    .results.find((task) => task.taskId === taskId)?.checkpoint;
  if (!checkpoint) return false;
  return !readSavedDelegationConversations(branch).checkpointIds.has(checkpoint.checkpointId);
}

function hasUnstoredForegroundResult(
  batch: ManagedBatch,
  branch: readonly SessionEntry[],
): boolean {
  return batch.mode === "foreground" && !hasToolResult(branch, batch.callId);
}

function hasToolResult(branch: readonly SessionEntry[], callId: string): boolean {
  return branch.some(
    (entry) =>
      entry.type === "message" &&
      entry.message.role === "toolResult" &&
      entry.message.toolCallId === callId,
  );
}

/** Read delivered result identities, independently of whether their Usage was reported. */
export function getSuccessfulCollection(
  entry: SessionEntry,
): { batchId: string; taskIds: string[] } | undefined {
  if (
    entry.type !== "message" ||
    entry.message.role !== "toolResult" ||
    entry.message.toolName !== AGENT_RESULT_TOOL_NAME ||
    entry.message.isError
  ) {
    return undefined;
  }
  const details = entry.message.details as
    | { batchId?: unknown; tasks?: ({ taskId?: unknown } | null)[] }
    | undefined;
  if (typeof details?.batchId !== "string" || !Array.isArray(details.tasks)) return undefined;
  return {
    batchId: details.batchId,
    taskIds: details.tasks.flatMap((task) =>
      typeof task?.taskId === "string" ? [task.taskId] : [],
    ),
  };
}
