// Root context refresh logic.
//
// Handles periodic re-injection of root/ancestor context files
// that pi loaded natively at startup.

import { wrapExtensionContext } from "@mrclrchtr/supi-core";
import type { ClaudeMdConfig } from "./config.ts";
import type { ClaudeMdState } from "./state.ts";

/**
 * Check if root context should be refreshed.
 */
export function shouldRefreshRoot(state: ClaudeMdState, config: ClaudeMdConfig): boolean {
  // Manual refresh flag (from /supi-claude-md refresh command or compaction)
  if (state.needsRefresh) return true;

  // Disabled
  if (config.rereadInterval === 0) return false;

  // Check turn interval
  const turnDelta = state.completedTurns - state.lastRefreshTurn;
  return turnDelta >= config.rereadInterval;
}

interface NativeContextFile {
  path: string;
  content: string;
}

/**
 * Format root context files into <extension-context> blocks.
 */
export function formatRefreshContext(contextFiles: NativeContextFile[]): string {
  const parts: string[] = [];

  for (const file of contextFiles) {
    const content = file.content.trim();
    if (content) {
      parts.push(wrapExtensionContext("supi-claude-md", content, { file: file.path }));
    }
  }

  return parts.join("\n\n");
}

type ContextMessageLike = {
  role?: string;
  customType?: string;
  details?: unknown;
};

/**
 * Prune stale refresh messages from the context, keeping only the active one.
 * Reorders the active message before the last user message.
 */
export function pruneStaleRefreshMessages<T extends ContextMessageLike>(
  messages: T[],
  activeToken: string | null,
): T[] {
  // Remove all refresh messages except the active one
  const filtered = messages.filter((message) => {
    if (message.customType !== "supi-claude-md-refresh") return true;
    if (!activeToken) return false;
    return getContextToken(message.details) === activeToken;
  });

  if (!activeToken) return filtered;

  // Find the active refresh message
  const contextIndex = filtered.findIndex(
    (message) =>
      message.customType === "supi-claude-md-refresh" &&
      getContextToken(message.details) === activeToken,
  );
  if (contextIndex === -1) return filtered;

  // Find the last user message
  const userIndex = findLastUserMessageIndex(filtered);
  if (userIndex === -1 || contextIndex < userIndex) return filtered;

  // Move context message before last user message
  const next = [...filtered];
  const [contextMessage] = next.splice(contextIndex, 1);
  if (!contextMessage) return filtered;
  next.splice(userIndex, 0, contextMessage);
  return next;
}

function getContextToken(details: unknown): string | null {
  if (!details || typeof details !== "object") return null;
  const token = (details as { contextToken?: unknown }).contextToken;
  return typeof token === "string" ? token : null;
}

function findLastUserMessageIndex<T extends ContextMessageLike>(messages: T[]): number {
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index]?.role === "user") return index;
  }
  return -1;
}

/**
 * Read native context files from pi's system prompt options.
 */
export function readNativeContextFiles(
  contextFiles: Array<{ path?: string; content?: string }>,
): NativeContextFile[] {
  const result: NativeContextFile[] = [];
  for (const file of contextFiles) {
    if (file.path && file.content) {
      result.push({ path: file.path, content: file.content });
    }
  }
  return result;
}
