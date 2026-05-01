// Subdirectory context injection logic.
//
// Handles formatting discovered context files into <extension-context> blocks
// and determining whether injection should occur based on staleness.

import * as fs from "node:fs";
import { wrapExtensionContext } from "@mrclrchtr/supi-core";
import type { DiscoveredContextFile } from "./discovery.ts";
import type { ContextUsage } from "./refresh.ts";
import type { InjectedDir } from "./state.ts";

/**
 * Format discovered context files into <extension-context> blocks.
 * Each file is read and wrapped individually.
 */
export function formatSubdirContext(files: DiscoveredContextFile[], turn: number): string {
  const parts: string[] = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(file.absolutePath, "utf-8").trim();
      if (content) {
        parts.push(
          wrapExtensionContext("supi-claude-md", content, {
            file: file.relativePath,
            turn,
          }),
        );
      }
    } catch {
      // File may have been deleted between discovery and read
    }
  }

  return parts.join("\n\n");
}

export interface InjectionCheckOptions {
  injectedDirs: Map<string, InjectedDir>;
  currentTurn: number;
  rereadInterval: number;
  contextThreshold: number;
  contextUsage?: ContextUsage;
}

/**
 * Determine if subdirectory context should be injected.
 * Returns true if:
 * - The directory has not been injected yet (always, even under context pressure)
 * - The directory was injected but is stale (turn delta >= rereadInterval)
 *   AND context usage is below the threshold
 * - rereadInterval is 0 (disabled — always false for re-injections)
 */
export function shouldInjectSubdir(dir: string, options: InjectionCheckOptions): boolean {
  const { injectedDirs, currentTurn, rereadInterval, contextThreshold, contextUsage } = options;

  // Never-injected directory: always inject (even when rereadInterval is 0)
  // First-time discovery is always allowed regardless of context pressure
  const injected = injectedDirs.get(dir);
  if (!injected) return true;

  // Already-injected directory: skip if reread is disabled
  if (rereadInterval === 0) return false;

  // Re-injection: skip when context usage is at or above threshold
  if (
    contextThreshold < 100 &&
    contextUsage &&
    contextUsage.percent != null &&
    contextUsage.percent >= contextThreshold
  ) {
    return false;
  }

  return currentTurn - injected.turn >= rereadInterval;
}
