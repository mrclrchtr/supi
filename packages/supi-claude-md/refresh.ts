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

// pruneStaleRefreshMessages, getContextToken, and findLastUserMessageIndex
// have been extracted to supi-core/context-messages.ts.
// Use pruneAndReorderContextMessages(messages, "supi-claude-md-refresh", activeToken) instead.

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
