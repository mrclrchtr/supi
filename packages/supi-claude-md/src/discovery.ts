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
export function findSubdirContextFiles(
  filePath: string,
  cwd: string,
  fileNames: string[],
): DiscoveredContextFile[] {
  const absFilePath = path.resolve(cwd, filePath);
  const absCwd = path.resolve(cwd);

  if (!isPathWithinCwd(absFilePath, absCwd)) {
    return [];
  }

  const startDir = resolveStartDir(absFilePath);
  if (!startDir) return [];

  return walkUpForContextFiles(startDir, absCwd, fileNames);
}

function isPathWithinCwd(absFilePath: string, absCwd: string): boolean {
  const relativeToFile = path.relative(absCwd, absFilePath);
  return !relativeToFile.startsWith("..") && !path.isAbsolute(relativeToFile);
}

function resolveStartDir(absFilePath: string): string | null {
  try {
    return fs.statSync(absFilePath).isDirectory() ? absFilePath : path.dirname(absFilePath);
  } catch {
    return null;
  }
}

function walkUpForContextFiles(
  startDir: string,
  absCwd: string,
  fileNames: string[],
): DiscoveredContextFile[] {
  const results: DiscoveredContextFile[] = [];
  let currentDir = startDir;

  while (true) {
    if (!isWithinCwd(currentDir, absCwd)) break;

    const found = findFirstContextFile(currentDir, fileNames, absCwd);
    if (found) results.push(found);

    if (currentDir === absCwd) break;

    const parent = path.dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
  }

  return results;
}

function isWithinCwd(dir: string, absCwd: string): boolean {
  const relDir = path.relative(absCwd, dir);
  return !relDir.startsWith("..") && (!path.isAbsolute(relDir) || relDir === "");
}

function findFirstContextFile(
  dir: string,
  fileNames: string[],
  absCwd: string,
): DiscoveredContextFile | null {
  for (const fileName of fileNames) {
    const candidate = path.join(dir, fileName);
    if (fs.existsSync(candidate)) {
      return {
        absolutePath: candidate,
        relativePath: path.relative(absCwd, candidate),
        dir,
      };
    }
  }
  return null;
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
