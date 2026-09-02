import type { ModelThinkingLevel, Usage } from "@earendil-works/pi-ai";
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { AgentConversationView } from "../tool/agent_run/conversation-view.ts";
import type { BatchTaskStatus } from "../tool/agent_run/registry.ts";
import type { AgentProfileFieldSources, ProfileDiagnostic, ProfileSource } from "../types.ts";

/** Number of Conversation View entries shown on one overlay page. */
export const AGENTS_CONVERSATION_PAGE_SIZE = 10;

/** One active or last-completed Agent Run shown in the overlay. */
export interface AgentsOverlayRun {
  readonly key: string;
  readonly active: boolean;
  readonly taskId: string;
  readonly profileId: string;
  readonly status: BatchTaskStatus;
  /** Stable failure stage for a non-completed task. */
  readonly failureCode?: string;
  readonly modelId?: string;
  readonly thinkingLevel?: ModelThinkingLevel;
  readonly turns: number;
  readonly toolUses: number;
  readonly usage?: Usage;
  readonly recentActivity?: readonly string[];
  readonly humanTruncated: boolean;
  readonly modelTruncated: boolean;
  /** Human-facing final assistant text for a completed task. */
  readonly finalText?: string;
  readonly taskMetadata?: AgentConversationView["taskMetadata"];
  readonly sharedContext?: string;
  readonly conversationView?: AgentConversationView;
}

/** One effective Agent Profile shown with human-only provenance. */
export interface AgentsOverlayProfile {
  readonly id: string;
  readonly description: string;
  readonly source?: ProfileSource;
  readonly directory?: string;
  readonly model?: string;
  readonly thinking?: string;
  readonly timeoutMinutes?: number;
  readonly tools?: readonly string[];
  readonly systemPrompt?: string;
  readonly instructionScopes?: readonly string[];
  readonly fieldSources?: AgentProfileFieldSources;
  readonly unavailable?: string;
}

/** Data shown by the session-scoped Agent Runs overlay. */
export interface AgentsOverlayData {
  readonly runs: readonly AgentsOverlayRun[];
  readonly profiles: readonly AgentsOverlayProfile[];
  readonly diagnostics: readonly ProfileDiagnostic[];
  readonly omittedDiagnosticCount: number;
  readonly omittedProfileCount: number;
}

/** Result of one interactive selected-run control. */
export type AgentOverlayControlResult = "accepted" | "not-running" | "canceled";

/** Runtime dependencies for the interactive overlay. */
export interface AgentsDialogDependencies {
  readonly theme: Theme;
  readonly done: () => void;
  readonly tui: { requestRender: () => void };
  readonly onSteer: (taskId: string) => Promise<AgentOverlayControlResult>;
  readonly onStop: (taskId: string) => Promise<Exclude<AgentOverlayControlResult, "canceled">>;
  readonly subscribe?: (listener: (data: AgentsOverlayData) => void) => () => void;
}
