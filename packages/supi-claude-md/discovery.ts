// Context file discovery — walk up from a file's directory toward cwd,
// finding CLAUDE.md / AGENTS.md (or configured file names) along the way.

import * as fs from "node:fs";
import * as path from "node:path";

export interface DiscoveredContextFile {
  /** Absolute path of the context file */
  absolutePath: string;
  /** Path relative to cwd */
  relativePath: string;
  /** The directory containing this file */
  dir: string;
}

/**
 * Walk up from a file's directory toward cwd, collecting context files.
 * Stops at cwd (does not walk above).
 * Returns files ordered from nearest ancestor to farthest (closest to cwd).
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: walk-up loop with early exits
export function findSubdirContextFiles(
  filePath: string,
  cwd: string,
  fileNames: string[],
): DiscoveredContextFile[] {
  const absFilePath = path.resolve(cwd, filePath);
  const absCwd = path.resolve(cwd);

  // File must be within cwd
  const relativeToFile = path.relative(absCwd, absFilePath);
  if (relativeToFile.startsWith("..") || path.isAbsolute(relativeToFile)) {
    return [];
  }

  // Start walking from the path itself (if it's a directory like `ls packages/foo`)
  // or its containing directory (if it's a file like `read packages/foo/bar.ts`)
  let currentDir: string;
  try {
    currentDir = fs.statSync(absFilePath).isDirectory() ? absFilePath : path.dirname(absFilePath);
  } catch {
    // Path doesn't exist (e.g. failed tool call resolved to missing file)
    return [];
  }
  const results: DiscoveredContextFile[] = [];

  while (true) {
    // Stop if we've gone above cwd
    const relDir = path.relative(absCwd, currentDir);
    if (relDir.startsWith("..") || (path.isAbsolute(relDir) && relDir !== "")) {
      break;
    }

    // Check for context file in this directory
    for (const fileName of fileNames) {
      const candidate = path.join(currentDir, fileName);
      if (fs.existsSync(candidate)) {
        results.push({
          absolutePath: candidate,
          relativePath: path.relative(absCwd, candidate),
          dir: currentDir,
        });
        break; // first match per directory
      }
    }

    // Stop at cwd (don't walk above)
    if (currentDir === absCwd) {
      break;
    }

    const parent = path.dirname(currentDir);
    if (parent === currentDir) break; // filesystem root
    currentDir = parent;
  }

  // Return from nearest (file dir) to farthest (cwd dir)
  return results;
}

/**
 * Filter out context files already loaded by pi natively.
 */
export function filterAlreadyLoaded(
  found: DiscoveredContextFile[],
  nativeContextPaths: Set<string>,
): DiscoveredContextFile[] {
  return found.filter((f) => !nativeContextPaths.has(f.absolutePath));
}

/**
 * Extract file path from a tool event input.
 * Returns null for unsupported tools.
 */
export function extractPathFromToolEvent(
  toolName: string,
  input: Record<string, unknown>,
): string | null {
  switch (toolName) {
    case "read":
    case "write":
    case "edit":
    case "ls": {
      const p = input.path;
      return typeof p === "string" ? p : null;
    }
    case "lsp":
    case "tree_sitter": {
      const f = input.file;
      return typeof f === "string" ? f : null;
    }
    default:
      return null;
  }
}
