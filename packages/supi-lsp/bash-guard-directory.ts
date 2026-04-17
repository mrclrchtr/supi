import { type Dirent, existsSync, readdirSync, statSync } from "node:fs";
import * as path from "node:path";
import type { LspManager } from "./manager.ts";
import { shouldIgnoreLspPath } from "./summary.ts";

const MAX_DIRECTORY_DEPTH = 5;
const MAX_FILES_VISITED = 1000;
const WARNED_DIRECTORY_LIMITS = new Set<string>();

interface PendingDirectory {
  path: string;
  depth: number;
}

interface TraversalState {
  filesVisited: number;
}

export function directoryContainsSupportedSource(directory: string, manager: LspManager): boolean {
  const pending: PendingDirectory[] = [{ path: directory, depth: 0 }];
  const state: TraversalState = { filesVisited: 0 };

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;

    const result = scanDirectoryEntries(current, pending, manager, state);
    if (result !== null) return result;
  }

  return false;
}

function scanDirectoryEntries(
  current: PendingDirectory,
  pending: PendingDirectory[],
  manager: LspManager,
  state: TraversalState,
): boolean | null {
  const entries = readDirectoryEntries(current.path);
  if (!entries) return null;

  for (const entry of entries) {
    const entryPath = path.join(current.path, entry.name);
    const result = inspectDirectoryEntry(entry, entryPath, {
      depth: current.depth,
      pending,
      manager,
      state,
    });
    if (result !== null) return result;
  }

  return null;
}

interface DirectoryInspectionContext {
  depth: number;
  pending: PendingDirectory[];
  manager: LspManager;
  state: TraversalState;
}

function inspectDirectoryEntry(
  entry: Dirent,
  entryPath: string,
  context: DirectoryInspectionContext,
): boolean | null {
  if (shouldIgnoreLspPath(entryPath)) return null;

  if (entry.isDirectory()) {
    if (context.depth >= MAX_DIRECTORY_DEPTH) {
      warnDirectoryLimitOnce(
        "depth",
        `[supi-lsp] Bash guard skipped a deep directory subtree after reaching depth ${MAX_DIRECTORY_DEPTH}.\n`,
      );
      return null;
    }
    context.pending.push({ path: entryPath, depth: context.depth + 1 });
    return null;
  }

  if (!entry.isFile()) return null;

  context.state.filesVisited += 1;
  if (context.state.filesVisited > MAX_FILES_VISITED) {
    warnDirectoryLimitOnce(
      "files",
      `[supi-lsp] Bash guard stopped scanning after ${MAX_FILES_VISITED} files while checking LSP nudge targets.\n`,
    );
    return false;
  }
  return context.manager.isSupportedSourceFile(entryPath) ? true : null;
}

function warnDirectoryLimitOnce(key: string, message: string): void {
  if (WARNED_DIRECTORY_LIMITS.has(key)) return;
  WARNED_DIRECTORY_LIMITS.add(key);
  process.stderr.write(message);
}

function readDirectoryEntries(directory: string): Dirent[] | null {
  if (!existsSync(directory)) return null;

  try {
    if (!statSync(directory).isDirectory()) return null;
    return readdirSync(directory, { withFileTypes: true });
  } catch {
    return null;
  }
}
