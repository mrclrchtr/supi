// Subdirectory context injection logic.
//
// Handles formatting discovered context files into <extension-context> blocks
// and determining whether injection should occur.

import * as fs from "node:fs";
import { wrapExtensionContext } from "@mrclrchtr/supi-core/api";
import type { DiscoveredContextFile } from "./discovery.ts";

/**
 * Format discovered context files into <extension-context> blocks.
 * Each file is read and wrapped individually.
 */
export function formatSubdirContext(files: DiscoveredContextFile[]): string {
  const parts: string[] = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(file.absolutePath, "utf-8").trim();
      if (content) {
        parts.push(
          wrapExtensionContext("supi-claude-md", content, {
            file: file.relativePath,
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
 * Returns true only if the directory has not been injected yet.
 */
export function shouldInjectSubdir(dir: string, injectedDirs: Set<string>): boolean {
  return !injectedDirs.has(dir);
}
