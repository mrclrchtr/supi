import type { ModelThinkingLevel, Usage } from "@earendil-works/pi-ai";
import type { AgentRunHandle, AgentRunProgress } from "@mrclrchtr/supi-agent-runtime/api";
import type { AgentConversationView, ConversationTaskMetadata } from "./conversation-view.ts";
import type { AgentRunTranscriptCapture, AgentRunTranscriptSource } from "./transcript-store.ts";

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
  /** Human-facing final assistant text, capped. */
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
  batchId: string;
  tasks: readonly BatchTaskResult[];
  sharedContext?: string;
  /** Aggregate usage across all started runs. */
  aggregateUsage?: Usage;
  /** Per-task bounded conversation views retained for model-facing details. */
  conversationViews: Record<string, AgentConversationView>;
  /** Per-task run keys used to connect batch results to their human-facing transcripts. */
  runKeys: Record<string, string>;
  /** Full transcripts stored outside model-facing tool results. */
  transcriptSources: Record<string, AgentRunTranscriptSource>;
}

/** Metadata needed to inspect and control one active Agent Run. */
export interface ActiveRunRegistration {
  runKey?: string;
  batchId?: string;
  transcript?: AgentRunTranscriptCapture;
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
  runKey: string;
  batchId: string;
  transcriptSource?: AgentRunTranscriptSource;
  modelId: string;
  thinkingLevel: ModelThinkingLevel;
  taskMetadata: ConversationTaskMetadata;
  conversationView: AgentConversationView;
}

/** Current session-local state exposed to the /agents overlay. */
export interface AgentRunRegistrySnapshot {
  activeRuns: readonly ActiveRunSnapshot[];
  activeSharedContext?: string;
  batches: readonly CompletedBatch[];
  lastBatch?: CompletedBatch;
}

/** Result of one selected-run stop request. */
export type AgentRunStopResult = "accepted" | "not-running";
