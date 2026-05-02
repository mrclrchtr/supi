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
  /** Map of directory path → injection info */
  injectedDirs: Map<string, InjectedDir>;
  /** Set of paths already loaded by pi natively (dedup) */
  nativeContextPaths: Set<string>;
  /** Whether this is the first before_agent_start (for native path capture) */
  firstAgentStart: boolean;
}

export function createInitialState(): ClaudeMdState {
  return {
    completedTurns: 0,
    injectedDirs: new Map(),
    nativeContextPaths: new Set(),
    firstAgentStart: true,
  };
}

const CONTEXT_TAG_REGEX =
  /<extension-context\s+source="supi-claude-md"\s+file="([^"]+)"\s+turn="(\d+)">/g;

export function reconstructState(branch: SessionEntry[]): {
  completedTurns: number;
  injectedDirs: Map<string, InjectedDir>;
} {
  let completedTurns = 0;
  const injectedDirs = new Map<string, InjectedDir>();

  for (const entry of branch) {
    if (isCompletedAssistantTurn(entry)) completedTurns++;

    const toolResultContent = getToolResultContent(entry);
    if (toolResultContent) {
      extractInjectedDirs(toolResultContent, injectedDirs);
    }
  }

  return { completedTurns, injectedDirs };
}

function isCompletedAssistantTurn(entry: SessionEntry): boolean {
  return (
    entry.type === "message" &&
    entry.message.role === "assistant" &&
    entry.message.stopReason === "stop"
  );
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
