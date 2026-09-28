import type { ModelThinkingLevel, Usage } from "@earendil-works/pi-ai";
import type { KeybindingsManager, Theme } from "@earendil-works/pi-coding-agent";
import type {
  AgentRunDisplayConversation,
  AgentRunRegistryRun,
} from "../session/agent-run-registry-types.ts";
import type { AgentRunTranscriptSource } from "../session/transcript-store.ts";

/** Shared height limit for the PI overlay and its rendered viewport. */
export const AGENTS_OVERLAY_MAX_HEIGHT_PERCENT = 100;

/** One Profile shown by the optional Agent Profiles pages. */
export interface AgentsProfilePageEntry {
  readonly id: string;
  readonly description: string;
  readonly source?: string;
  readonly directory?: string;
  readonly model?: string;
  readonly thinking?: string;
  readonly timeoutMinutes?: number;
  readonly tools?: readonly string[];
  readonly systemPrompt?: string;
  readonly instructionScopes?: readonly string[];
  readonly fieldSources?: Readonly<Record<string, string>>;
  readonly unavailable?: string;
}

/** One bounded diagnostic shown by the optional Agent Profile Diagnostics page. */
export interface AgentsProfileDiagnostic {
  readonly profileId: string;
  readonly source: string;
  readonly code: string;
  readonly message: string;
  readonly directory?: string;
}

/** Optional Agent-owned data for the two Agent Profile pages. */
export interface AgentsProfilePagesData {
  readonly profiles: readonly AgentsProfilePageEntry[];
  readonly diagnostics: readonly AgentsProfileDiagnostic[];
  readonly omittedProfileCount: number;
  readonly omittedDiagnosticCount: number;
}

/** Read-only provider for Agent-owned profile pages. */
export interface AgentsProfilePages {
  getData(): AgentsProfilePagesData | undefined;
}

/** One active or completed managed run shown in the shared viewer. */
export interface AgentsOverlayRun extends AgentRunRegistryRun {
  readonly key: string;
  readonly transcriptSource?: AgentRunTranscriptSource;
  readonly conversation?: AgentRunDisplayConversation;
  readonly usage?: Usage;
  readonly thinkingLevel: ModelThinkingLevel;
  readonly result?: AgentRunRegistryRun["result"];
}

/** Data shown by the session-scoped /agents overlay. */
export interface AgentsOverlayData {
  readonly runs: readonly AgentsOverlayRun[];
  readonly profilePages?: AgentsProfilePagesData;
}

/** Result of one interactive selected-run control. */
export type AgentOverlayControlResult = "accepted" | "not-running" | "canceled";

/** Runtime dependencies for the interactive overlay. */
export interface AgentsDialogDependencies {
  readonly theme: Theme;
  readonly done: () => void;
  readonly tui: { requestRender: () => void; terminal: { rows: number } };
  readonly keybindings?: Pick<KeybindingsManager, "getKeys" | "matches">;
  readonly onSteer: (runKey: string, message: string) => Promise<AgentOverlayControlResult>;
  readonly onStop: (runKey: string) => Promise<Exclude<AgentOverlayControlResult, "canceled">>;
  readonly subscribe?: (listener: (data: AgentsOverlayData) => void) => () => void;
}
