// Subdirectory context injection logic.
//
// Handles formatting discovered context files into <extension-context> blocks
// and determining whether injection should occur based on staleness.

import * as fs from "node:fs";
import { wrapExtensionContext } from "@mrclrchtr/supi-core";
import type { DiscoveredContextFile } from "./discovery.ts";
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

/**
 * Determine if subdirectory context should be injected.
 * Returns true if:
 * - The directory has not been injected yet
 * - The directory was injected but is stale (turn delta >= rereadInterval)
 * - rereadInterval is 0 (disabled — always false)
 */
export function shouldInjectSubdir(
  dir: string,
  injectedDirs: Map<string, InjectedDir>,
  currentTurn: number,
  rereadInterval: number,
): boolean {
  // Never-injected directory: always inject (even when rereadInterval is 0)
  const injected = injectedDirs.get(dir);
  if (!injected) return true;

  // Already-injected directory: skip if reread is disabled
  if (rereadInterval === 0) return false;

  return currentTurn - injected.turn >= rereadInterval;
}
