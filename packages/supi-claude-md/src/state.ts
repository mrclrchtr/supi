// Internal state types for supi-claude-md.
//
// State is reconstructed from session history on session_start
// and mutated in-place during the session lifecycle.

import type { SessionEntry } from "@earendil-works/pi-coding-agent";

export interface ClaudeMdState {
  /** Set of directory paths whose context has already been injected */
  injectedDirs: Set<string>;
  /** Set of paths already loaded by pi natively (dedup) */
  nativeContextPaths: Set<string>;
  /** Whether this is the first before_agent_start (for native path capture) */
  firstAgentStart: boolean;
}

export function createInitialState(): ClaudeMdState {
  return {
    injectedDirs: new Set(),
    nativeContextPaths: new Set(),
    firstAgentStart: true,
  };
}

const CONTEXT_TAG_REGEX = /<extension-context\s+source="supi-claude-md"\s+file="([^"]+)"[^>]*>/g;

export function reconstructState(branch: SessionEntry[]): {
  injectedDirs: Set<string>;
} {
  const injectedDirs = new Set<string>();

  for (const entry of branch) {
    const toolResultContent = getToolResultContent(entry);
    if (toolResultContent) {
      extractInjectedDirs(toolResultContent, injectedDirs);
    }
  }

  return { injectedDirs };
}

function getToolResultContent(entry: SessionEntry): unknown {
  if (entry.type !== "message" || entry.message.role !== "toolResult") {
    return undefined;
  }
  return entry.message.content;
}

function extractInjectedDirs(content: unknown, injectedDirs: Set<string>): void {
  const parts = content as Array<{ type?: string; text?: string }> | undefined;
  if (!parts) return;

  for (const part of parts) {
    if (part.type === "text" && part.text) {
      parseContextTags(part.text, injectedDirs);
    }
  }
}

function parseContextTags(text: string, injectedDirs: Set<string>): void {
  const matches = text.matchAll(CONTEXT_TAG_REGEX);
  for (const match of matches) {
    const file = match[1];
    if (file) {
      const lastSlash = Math.max(file.lastIndexOf("/"), file.lastIndexOf("\\"));
      const dir = lastSlash >= 0 ? file.substring(0, lastSlash) : ".";
      injectedDirs.add(dir);
    }
  }
}
