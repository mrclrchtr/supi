// Root context refresh helpers (historical compatibility).
//
// These functions are no longer used for active root refresh because
// pi's system prompt already contains native context files on every turn.
// SuPi never re-injects systemPromptOptions.contextFiles contents.

import { wrapExtensionContext } from "@mrclrchtr/supi-core";
import type { ClaudeMdConfig } from "./config.ts";
import type { ClaudeMdState } from "./state.ts";

/**
 * Context usage info from pi's ctx.getContextUsage().
 */
export interface ContextUsage {
  tokens: number | null;
  contextWindow: number;
  percent: number | null;
}

/**
 * Check if root context should be refreshed.
 * @deprecated Root/native context refresh is retired. Always returns false.
 */
export function shouldRefreshRoot(
  _state: ClaudeMdState,
  _config: ClaudeMdConfig,
  _contextUsage?: ContextUsage,
): boolean {
  return false;
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
 * @deprecated Root/native context refresh is retired. Always returns empty array.
 */
export function readNativeContextFiles(
  _contextFiles: Array<{ path?: string; content?: string }>,
  _cwd: string,
): NativeContextFile[] {
  return [];
}
