import { randomUUID } from "node:crypto";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import type { AgentRunContext } from "@mrclrchtr/supi-agent-runtime/api";
import { cloneAgentRunContext } from "@mrclrchtr/supi-agent-runtime/api";

const CHECKPOINT_VERSION = 1;
const CHECKPOINT_TOOL_NAMES = new Set(["agent_run", "agent_result"]);
const TERMINAL_STATUSES = new Set(["completed", "failed", "canceled", "timeout"]);
const SAFE_FAILURE_CODES = new Set([
  "session-creation-failed",
  "session-not-ready",
  "prompt-rejected",
  "missing-completion",
  "provider-error",
  "unexpected-runner-failure",
  "canceled",
  "timeout",
]);

/** Context data saved with one stored Delegation Task Result. */
export interface DelegationCheckpoint {
  readonly version: 1;
  readonly checkpointId: string;
  readonly conversationId: string;
  readonly label: string;
  readonly profileId: string;
  readonly parentCheckpointId: string | null;
  readonly entries: readonly SessionEntry[];
  readonly leafId: string | null;
  readonly runStatus: "completed" | "failed" | "canceled" | "timeout";
  readonly failureCode?: string;
  /** Requested task cwd; omitted when the conversation shares the parent's cwd. */
  readonly cwd?: string;
}

/** One conversation discovered from valid records on the active parent branch. */
export interface SavedDelegationConversation {
  readonly conversationId: string;
  readonly label?: string;
  readonly profileId?: string;
  readonly latest?: DelegationCheckpoint;
  readonly context?: AgentRunContext;
  readonly unavailableReason?: string;
}

interface MutableConversation {
  conversationId: string;
  label?: string;
  profileId?: string;
  latest?: DelegationCheckpoint;
  context?: AgentRunContext;
  unavailableReason?: string;
}

interface StoredCheckpoint {
  readonly record: DelegationCheckpoint;
  readonly context: AgentRunContext;
}

interface CheckpointIndex {
  readonly conversations: Map<string, MutableConversation>;
  readonly checkpoints: Map<string, StoredCheckpoint>;
  readonly checkpointIds: Set<string>;
}

/** Build a checkpoint delta without repeating entries from the restored parent checkpoint. */
export function createDelegationCheckpoint(options: {
  readonly context: AgentRunContext | undefined;
  readonly baseContext: AgentRunContext | undefined;
  readonly conversationId: string;
  readonly label: string;
  readonly profileId: string;
  readonly parentCheckpointId: string | null;
  readonly runStatus: DelegationCheckpoint["runStatus"];
  readonly failureCode?: string;
  readonly cwd?: string;
}): DelegationCheckpoint | undefined {
  if (!options.context) return undefined;
  try {
    const captured = cloneAgentRunContext(options.context);
    const inheritedIds = new Set(options.baseContext?.entries.map((entry) => entry.id) ?? []);
    const entries = captured.entries.filter((entry) => !inheritedIds.has(entry.id));
    if (entries.length === 0) return undefined;
    return {
      version: CHECKPOINT_VERSION,
      checkpointId: randomUUID(),
      conversationId: options.conversationId,
      label: options.label,
      profileId: options.profileId,
      parentCheckpointId: options.parentCheckpointId,
      entries,
      leafId: captured.leafId,
      runStatus: options.runStatus,
      ...(options.failureCode ? { failureCode: options.failureCode } : {}),
      ...(options.cwd ? { cwd: options.cwd } : {}),
    };
  } catch {
    return undefined;
  }
}

/** Read and validate checkpoint ancestry from one raw active parent branch. */
export function readSavedDelegationConversations(branch: readonly SessionEntry[]): {
  conversations: readonly SavedDelegationConversation[];
  checkpointIds: ReadonlySet<string>;
} {
  const index: CheckpointIndex = {
    conversations: new Map(),
    checkpoints: new Map(),
    checkpointIds: new Set(),
  };
  for (const entry of branch) {
    for (const task of storedCheckpointTasks(entry)) processCheckpointTask(index, task);
  }
  return { conversations: [...index.conversations.values()], checkpointIds: index.checkpointIds };
}

function storedCheckpointTasks(entry: SessionEntry): Record<string, unknown>[] {
  if (entry.type !== "message" || entry.message.role !== "toolResult") return [];
  if (!CHECKPOINT_TOOL_NAMES.has(entry.message.toolName)) return [];
  const details = asRecord(entry.message.details);
  if (!Array.isArray(details?.tasks)) return [];
  return details.tasks.filter(
    (task): task is Record<string, unknown> => asRecord(task) !== undefined && "checkpoint" in task,
  );
}

function processCheckpointTask(index: CheckpointIndex, task: Record<string, unknown>): void {
  const raw = asRecord(task.checkpoint);
  const candidateId =
    typeof raw?.conversationId === "string" ? raw.conversationId : task.conversationId;
  if (typeof candidateId !== "string") return;
  const conversation = getConversation(index, candidateId);
  const shape = validateCheckpointShape(task.checkpoint, candidateId);
  if (typeof raw?.checkpointId === "string") index.checkpointIds.add(raw.checkpointId);
  if ("error" in shape) {
    invalidate(conversation, shape.error, task);
    return;
  }
  const checkpoint = shape.record;
  if (skipRepeatedCheckpoint(index, conversation, checkpoint, task)) return;
  if (hasTaskMetadataMismatch(task, checkpoint)) {
    invalidate(conversation, "Saved context metadata does not match its task result.", task);
    return;
  }
  if (conversation.unavailableReason) return;
  const parent = resolveParentContext(index, conversation, checkpoint);
  if ("error" in parent) {
    invalidate(conversation, parent.error, task);
    return;
  }
  saveCheckpoint({ index, conversation, checkpoint, parentContext: parent.context, task });
}

function getConversation(index: CheckpointIndex, conversationId: string): MutableConversation {
  let conversation = index.conversations.get(conversationId);
  if (!conversation) {
    conversation = { conversationId };
    index.conversations.set(conversationId, conversation);
  }
  return conversation;
}

function skipRepeatedCheckpoint(
  index: CheckpointIndex,
  conversation: MutableConversation,
  checkpoint: DelegationCheckpoint,
  task: Record<string, unknown>,
): boolean {
  const repeated = index.checkpoints.get(checkpoint.checkpointId);
  if (!repeated) return false;
  if (JSON.stringify(repeated.record) !== JSON.stringify(checkpoint)) {
    invalidate(conversation, "Saved context contains a conflicting checkpoint record.", task);
  }
  return true;
}

function hasTaskMetadataMismatch(
  task: Record<string, unknown>,
  checkpoint: DelegationCheckpoint,
): boolean {
  return (
    ("conversationId" in task && task.conversationId !== checkpoint.conversationId) ||
    ("conversationLabel" in task && task.conversationLabel !== checkpoint.label) ||
    ("profileId" in task && task.profileId !== checkpoint.profileId)
  );
}

function resolveParentContext(
  index: CheckpointIndex,
  conversation: MutableConversation,
  checkpoint: DelegationCheckpoint,
): { context?: AgentRunContext } | { error: string } {
  const prior = conversation.latest;
  if (checkpoint.parentCheckpointId === null) {
    return prior ? { error: "Saved context has an incomplete checkpoint ancestry." } : {};
  }
  const parent = index.checkpoints.get(checkpoint.parentCheckpointId);
  if (
    !parent ||
    parent.record.conversationId !== checkpoint.conversationId ||
    prior?.checkpointId !== checkpoint.parentCheckpointId
  ) {
    return { error: "Saved context refers to a missing or off-branch checkpoint." };
  }
  if (
    parent.record.label !== checkpoint.label ||
    parent.record.profileId !== checkpoint.profileId ||
    parent.record.cwd !== checkpoint.cwd
  ) {
    return { error: "Saved context changes its conversation label, profile, or cwd." };
  }
  return { context: parent.context };
}

function saveCheckpoint(options: {
  index: CheckpointIndex;
  conversation: MutableConversation;
  checkpoint: DelegationCheckpoint;
  parentContext: AgentRunContext | undefined;
  task: Record<string, unknown>;
}): void {
  const { index, conversation, checkpoint, parentContext, task } = options;
  try {
    const context = cloneAgentRunContext({
      entries: [...(parentContext?.entries ?? []), ...checkpoint.entries],
      leafId: checkpoint.leafId,
    });
    index.checkpoints.set(checkpoint.checkpointId, { record: checkpoint, context });
    conversation.label = checkpoint.label;
    conversation.profileId = checkpoint.profileId;
    conversation.latest = checkpoint;
    conversation.context = context;
  } catch {
    invalidate(conversation, "Saved context entries are invalid or incomplete.", task);
  }
}

function validateCheckpointShape(
  value: unknown,
  expectedConversationId: string,
): { record: DelegationCheckpoint } | { error: string } {
  const raw = asRecord(value);
  if (!raw) return { error: "Saved context record is invalid." };
  if (raw.version !== CHECKPOINT_VERSION) {
    return { error: "Saved context uses an unsupported checkpoint version." };
  }
  if (
    typeof raw.checkpointId !== "string" ||
    raw.checkpointId.length === 0 ||
    raw.checkpointId.length > 128 ||
    raw.conversationId !== expectedConversationId ||
    expectedConversationId.length === 0 ||
    expectedConversationId.length > 128 ||
    typeof raw.label !== "string" ||
    raw.label.length === 0 ||
    raw.label.length > 64 ||
    typeof raw.profileId !== "string" ||
    raw.profileId.length === 0 ||
    raw.profileId.length > 64 ||
    (raw.parentCheckpointId !== null &&
      (typeof raw.parentCheckpointId !== "string" ||
        raw.parentCheckpointId.length === 0 ||
        raw.parentCheckpointId.length > 128)) ||
    !Array.isArray(raw.entries) ||
    raw.entries.length === 0 ||
    (raw.leafId !== null && typeof raw.leafId !== "string") ||
    typeof raw.runStatus !== "string" ||
    !TERMINAL_STATUSES.has(raw.runStatus)
  ) {
    return { error: "Saved context record is invalid." };
  }
  if (
    raw.failureCode !== undefined &&
    (typeof raw.failureCode !== "string" || !SAFE_FAILURE_CODES.has(raw.failureCode))
  ) {
    return { error: "Saved context record is invalid." };
  }
  if (
    raw.cwd !== undefined &&
    (typeof raw.cwd !== "string" || raw.cwd.length === 0 || raw.cwd.length > 4096)
  ) {
    return { error: "Saved context record is invalid." };
  }
  return { record: raw as unknown as DelegationCheckpoint };
}

function invalidate(
  conversation: MutableConversation,
  reason: string,
  task: Record<string, unknown>,
): void {
  conversation.unavailableReason = reason;
  const label = task.conversationLabel;
  const profileId = task.profileId;
  if (!conversation.label && typeof label === "string" && label.length <= 64)
    conversation.label = label;
  if (!conversation.profileId && typeof profileId === "string" && profileId.length <= 64)
    conversation.profileId = profileId;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
