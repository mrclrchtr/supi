import * as fs from "node:fs";
import * as path from "node:path";
import { FileChangeType, type FileEvent } from "./types.ts";
import { fileToUri } from "./utils.ts";

const IGNORED_DIRECTORIES = new Set(["node_modules", ".pnpm", ".git", "dist", "coverage"]);
const ROOT_LOCKFILES = ["pnpm-lock.yaml", "package-lock.json", "yarn.lock", "bun.lockb"];

/** Build a fresh snapshot of workspace sentinel files and their mtimes. */
export function scanWorkspaceSentinels(cwd: string): Map<string, number> {
  const resolvedCwd = path.resolve(cwd);
  const snapshot = new Map<string, number>();

  if (!fs.existsSync(resolvedCwd)) return snapshot;

  try {
    walkWorkspace(resolvedCwd, resolvedCwd, snapshot);
  } catch {
    return snapshot;
  }

  return snapshot;
}

/** Diff two sentinel snapshots into LSP file change events. */
export function diffWorkspaceSentinelSnapshot(
  previous: Map<string, number>,
  next: Map<string, number>,
): FileEvent[] {
  const changes: FileEvent[] = [];

  for (const [filePath, mtime] of next) {
    const previousMtime = previous.get(filePath);
    if (previousMtime === undefined) {
      changes.push({ uri: fileToUri(filePath), type: FileChangeType.Created });
      continue;
    }
    if (previousMtime !== mtime) {
      changes.push({ uri: fileToUri(filePath), type: FileChangeType.Changed });
    }
  }

  for (const filePath of previous.keys()) {
    if (next.has(filePath)) continue;
    changes.push({ uri: fileToUri(filePath), type: FileChangeType.Deleted });
  }

  return changes.sort((a, b) => a.uri.localeCompare(b.uri));
}

/** Refresh a previous snapshot and return the new snapshot plus change events. */
export function syncWorkspaceSentinelSnapshot(
  cwd: string,
  previous: Map<string, number>,
): { snapshot: Map<string, number>; changes: FileEvent[] } {
  const snapshot = scanWorkspaceSentinels(cwd);
  return {
    snapshot,
    changes: diffWorkspaceSentinelSnapshot(previous, snapshot),
  };
}

/** Determine whether a file path should trigger workspace recovery. */
export function isWorkspaceRecoveryTrigger(filePath: string, cwd: string): boolean {
  const root = path.resolve(cwd);
  return isWorkspaceSentinelPath(path.resolve(root, filePath), root);
}

function walkWorkspace(root: string, directory: string, snapshot: Map<string, number>): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    // Permission error or deleted directory — skip it rather than
    // failing the entire scan. A partial snapshot still detects
    // changes in accessible subtrees.
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      walkWorkspace(root, path.join(directory, entry.name), snapshot);
      continue;
    }

    if (!entry.isFile()) continue;

    const filePath = path.join(directory, entry.name);
    if (!isWorkspaceSentinelPath(filePath, root)) continue;
    try {
      snapshot.set(filePath, fs.statSync(filePath).mtimeMs);
    } catch {
      // File deleted between readdir and stat — skip.
    }
  }
}

function isWorkspaceSentinelPath(filePath: string, root: string): boolean {
  const name = path.basename(filePath);

  if (name === "package.json") return true;
  if (name === "jsconfig.json") return true;
  if (name === "tsconfig.json") return true;
  if (name.startsWith("tsconfig.") && name.endsWith(".json")) return true;
  if (filePath.endsWith(".d.ts")) return true;

  return isRootLockfile(filePath, root);
}

function isRootLockfile(filePath: string, root: string): boolean {
  if (path.dirname(filePath) !== root) return false;
  return ROOT_LOCKFILES.includes(path.basename(filePath));
}
