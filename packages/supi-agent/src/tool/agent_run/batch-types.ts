import type { ModelThinkingLevel, Usage } from "@earendil-works/pi-ai";
import type {
  AgentRunAuxiliaryModelSnapshot,
  AgentRunProgress,
  AgentRunRegistry,
} from "@mrclrchtr/supi-agent-runtime/api";
import type { DelegationCheckpoint } from "../../delegation/checkpoints.ts";
import type { ResolvedTask } from "./batch-preflight.ts";
import type { AgentConversationView, ConversationTaskMetadata } from "./conversation-view.ts";
import type { AgentRunToolParams } from "./schema.ts";

/** Per-task status tracked during live Delegation Batch execution. */
export type BatchTaskStatus = AgentRunProgress["status"];

/** Live progress for one Delegation Task. */
export interface BatchTaskProgress {
  taskId: string;
  profileId: string;
  conversationId: string;
  conversationLabel: string;
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
  conversationId: string;
  conversationLabel: string;
  checkpoint?: DelegationCheckpoint;
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
  /** Canonical provider-error summary; never raw errors or provider response content. */
  failureSummary?: string;
  turns: number;
  toolUses: number;
  modelId?: string;
  thinkingLevel?: ModelThinkingLevel;
  taskMetadata?: ConversationTaskMetadata;
  conversationView?: AgentConversationView;
}

/** Final outcome of one Delegation Batch. Results follow input task order. */
export interface DelegationBatchOutcome {
  results: BatchTaskResult[];
  aggregateUsage?: Usage;
  conversationViews: Map<string, AgentConversationView>;
  batchId: string;
  runKeys: ReadonlyMap<string, string>;
}

/** Options for starting a preflighted and capacity-admitted Delegation Batch. */
export interface StartDelegationBatchOptions {
  params: AgentRunToolParams;
  tasks: readonly ResolvedTask[];
  cwd: string;
  signal?: AbortSignal;
  registry?: AgentRunRegistry;
  /** One model catalogue shared by the opted-in children of this invocation. */
  authorizedAuxiliaryModels?: AgentRunAuxiliaryModelSnapshot;
  onUpdate?: (progress: BatchProgressState) => void;
  onTaskResult?: (result: BatchTaskResult, batchId: string) => void;
}

/** Session-owned control surface for one running Delegation Batch. */
export interface DelegationBatchHandle {
  readonly batchId: string;
  readonly runKeys: ReadonlyMap<string, string>;
  readonly result: Promise<DelegationBatchOutcome>;
  /** Return finalized results only, in input order, with current views and usage. */
  snapshot(): DelegationBatchOutcome;
  /** Return progress for every task in input order. */
  progress(): BatchProgressState;
  /** Stop all active child runs and wait for their bounded disposal. */
  stop(): Promise<void>;
}
