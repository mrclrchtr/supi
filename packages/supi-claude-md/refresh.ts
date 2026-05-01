// Root context refresh logic.
//
// Handles periodic re-injection of root/ancestor context files
// that pi loaded natively at startup.

import * as path from "node:path";
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
 * Returns false when context usage is at or above the configured threshold.
 */
export function shouldRefreshRoot(
  state: ClaudeMdState,
  config: ClaudeMdConfig,
  contextUsage?: ContextUsage,
): boolean {
  // Disabled
  if (config.rereadInterval === 0) return false;

  // Context pressure gate: skip refresh when context is nearly full
  if (
    config.contextThreshold < 100 &&
    contextUsage &&
    contextUsage.percent != null &&
    contextUsage.percent >= config.contextThreshold
  ) {
    return false;
  }

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
 * Filters out files resolved outside the project tree (cwd).
 */
export function readNativeContextFiles(
  contextFiles: Array<{ path?: string; content?: string }>,
  cwd: string,
): NativeContextFile[] {
  const absCwd = path.resolve(cwd);
  const result: NativeContextFile[] = [];
  for (const file of contextFiles) {
    if (!file.path || !file.content) continue;
    const absPath = path.resolve(file.path);
    const rel = path.relative(absCwd, absPath);
    if (rel.startsWith("..") || path.isAbsolute(rel)) continue;
    result.push({ path: file.path, content: file.content });
  }
  return result;
}
