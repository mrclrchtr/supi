import type { ModelThinkingLevel, Usage } from "@earendil-works/pi-ai";
import type { AgentRunHandle, AgentRunProgress } from "../types.ts";
import type { AgentRunTranscriptCapture, AgentRunTranscriptSource } from "./transcript-store.ts";

/** One bounded human-facing entry in a run's live conversation summary. */
export type AgentRunDisplayEntry =
  | { readonly kind: "assistant"; readonly text: string }
  | { readonly kind: "steering"; readonly text: string }
  | {
      readonly kind: "tool";
      readonly toolName: string;
      readonly status: "completed" | "error" | "unknown";
      readonly summary?: string;
    };

/** A caller-provided, bounded summary for the run viewer. */
export interface AgentRunDisplayConversation {
  readonly entries: readonly AgentRunDisplayEntry[];
  readonly omittedEntryCount: number;
  readonly omittedCharacterCount: number;
  readonly textTruncated: boolean;
}

/** Caller-owned display fields that do not change Agent Run execution or outcome. */
export interface AgentRunDisplayDetails {
  readonly target?: string;
  readonly batchLabel?: string;
  readonly verdict?: string;
  readonly findingCount?: number;
  readonly blockingFindingCount?: number;
}

/** Neutral metadata for one Agent Run in the containing-session viewer. */
export interface AgentRunDisplayMetadata {
  readonly runKey?: string;
  readonly batchId?: string;
  readonly taskId: string;
  /** Short caller-owned role, such as "Agent" or "Reviewer". */
  readonly kind: string;
  /** Short caller-owned label, such as a Profile ID or Review Mode. */
  readonly label: string;
  readonly cwd: string;
  readonly modelId: string;
  readonly thinkingLevel: ModelThinkingLevel;
  readonly tools: readonly string[];
  readonly taskDescription?: string;
  readonly sharedContext?: string;
  readonly display?: AgentRunDisplayDetails;
  readonly startedAt: number;
}

/** Parent-owned details that the runtime viewer can show without changing tool output. */
export interface AgentRunDisplayResult {
  readonly finalText?: string;
  readonly display?: AgentRunDisplayDetails;
  readonly failureCode?: string;
  readonly humanTruncated?: boolean;
  readonly modelTruncated?: boolean;
}

/** Metadata and controls needed to register one active run. */
export interface AgentRunRegistration {
  readonly metadata: AgentRunDisplayMetadata;
  readonly transcript?: AgentRunTranscriptCapture;
  readonly handle: AgentRunHandle<unknown>;
  readonly getConversation?: (
    queuedSteering: readonly string[],
  ) => AgentRunDisplayConversation | undefined;
  readonly getRecentActivity?: () => readonly string[];
}

/** One active or completed run exposed to the shared viewer. */
export interface AgentRunRegistryRun extends AgentRunDisplayMetadata {
  readonly runKey: string;
  readonly batchId: string;
  readonly active: boolean;
  readonly status: AgentRunProgress["status"];
  readonly finishedAt?: number;
  readonly steeringAvailable: boolean;
  readonly turns: number;
  readonly toolUses: number;
  readonly usage?: Usage;
  readonly recentActivity?: readonly string[];
  readonly transcriptSource?: AgentRunTranscriptSource;
  readonly conversation?: AgentRunDisplayConversation;
  readonly result?: AgentRunDisplayResult;
}

/** Current session-local state for the shared run viewer. */
export interface AgentRunRegistrySnapshot {
  readonly runs: readonly AgentRunRegistryRun[];
}

/** Result of one selected-run stop request. */
export type AgentRunStopResult = "accepted" | "not-running";
