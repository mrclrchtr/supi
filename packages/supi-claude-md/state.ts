// Internal state types for supi-claude-md.
//
// State is reconstructed from session history on session_start
// and mutated in-place during the session lifecycle.

import type { SessionEntry } from "@mariozechner/pi-coding-agent";

export interface InjectedDir {
  /** Turn number when this directory's context was last injected */
  turn: number;
  /** Relative path of the context file that was injected */
  file: string;
}

export interface ClaudeMdState {
  /** Count of completed assistant turns (stopReason: "stop") */
  completedTurns: number;
  /** Turn number of the last root context refresh */
  lastRefreshTurn: number;
  /** Map of directory path → injection info */
  injectedDirs: Map<string, InjectedDir>;
  /** Token of the current active root refresh message (for pruning) */
  currentContextToken: string | null;
  /** Counter for generating unique context tokens */
  contextCounter: number;
  /** Set of paths already loaded by pi natively (dedup) */
  nativeContextPaths: Set<string>;
  /** Whether this is the first before_agent_start (for native path capture) */
  firstAgentStart: boolean;
}

export function createInitialState(): ClaudeMdState {
  return {
    completedTurns: 0,
    lastRefreshTurn: 0,
    injectedDirs: new Map(),
    currentContextToken: null,
    contextCounter: 0,
    nativeContextPaths: new Set(),
    firstAgentStart: true,
  };
}

const CONTEXT_TAG_REGEX =
  /<extension-context\s+source="supi-claude-md"\s+file="([^"]+)"\s+turn="(\d+)">/g;

const REFRESH_CUSTOM_TYPE = "supi-claude-md-refresh";

export function reconstructState(branch: SessionEntry[]): {
  completedTurns: number;
  lastRefreshTurn: number;
  injectedDirs: Map<string, InjectedDir>;
  contextCounter: number;
} {
  let completedTurns = 0;
  let lastRefreshTurn = 0;
  let contextCounter = 0;
  const injectedDirs = new Map<string, InjectedDir>();

  for (const entry of branch) {
    if (isCompletedAssistantTurn(entry)) completedTurns++;
    if (isRefreshMessage(entry)) {
      lastRefreshTurn = getRefreshTurn(entry.details);
      contextCounter = Math.max(contextCounter, getRefreshCounter(entry.details));
    }

    const toolResultContent = getToolResultContent(entry);
    if (toolResultContent) {
      extractInjectedDirs(toolResultContent, injectedDirs);
    }
  }

  return { completedTurns, lastRefreshTurn, injectedDirs, contextCounter };
}

function isCompletedAssistantTurn(entry: SessionEntry): boolean {
  return (
    entry.type === "message" &&
    entry.message.role === "assistant" &&
    entry.message.stopReason === "stop"
  );
}

function isRefreshMessage(
  entry: SessionEntry,
): entry is Extract<SessionEntry, { type: "custom_message" }> {
  return entry.type === "custom_message" && entry.customType === REFRESH_CUSTOM_TYPE;
}

function getRefreshTurn(details: unknown): number {
  const d = details as { turn?: number } | undefined;
  return d?.turn ?? 0;
}

function getRefreshCounter(details: unknown): number {
  const d = details as { contextToken?: string } | undefined;
  const match = d?.contextToken?.match(/^supi-claude-md-(\d+)$/);
  if (!match?.[1]) return 0;

  const counter = Number.parseInt(match[1], 10);
  return Number.isNaN(counter) ? 0 : counter;
}

function getToolResultContent(entry: SessionEntry): unknown {
  if (entry.type !== "message" || entry.message.role !== "toolResult") {
    return undefined;
  }
  return entry.message.content;
}

function extractInjectedDirs(content: unknown, injectedDirs: Map<string, InjectedDir>): void {
  const parts = content as Array<{ type?: string; text?: string }> | undefined;
  if (!parts) return;

  for (const part of parts) {
    if (part.type === "text" && part.text) {
      parseContextTags(part.text, injectedDirs);
    }
  }
}

function parseContextTags(text: string, injectedDirs: Map<string, InjectedDir>): void {
  const matches = text.matchAll(CONTEXT_TAG_REGEX);
  for (const match of matches) {
    const file = match[1];
    const turn = Number.parseInt(match[2] ?? "0", 10);
    if (file) {
      const lastSlash = Math.max(file.lastIndexOf("/"), file.lastIndexOf("\\"));
      const dir = lastSlash >= 0 ? file.substring(0, lastSlash) : ".";
      injectedDirs.set(dir, { turn, file });
    }
  }
}
