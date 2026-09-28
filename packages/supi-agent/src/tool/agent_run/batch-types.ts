import type { ModelThinkingLevel, Usage } from "@earendil-works/pi-ai";
import type { AgentRunProgress } from "@mrclrchtr/supi-agent-runtime/api";
import type { AgentConversationView, ConversationTaskMetadata } from "./conversation-view.ts";

/** Per-task status tracked during live Delegation Batch execution. */
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

/** Public view of one Delegation Task outcome. */
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
  /** Failure stage for a non-success outcome. */
  failureCode?: string;
  turns: number;
  toolUses: number;
  modelId?: string;
  thinkingLevel?: ModelThinkingLevel;
  taskMetadata?: ConversationTaskMetadata;
  conversationView?: AgentConversationView;
}
