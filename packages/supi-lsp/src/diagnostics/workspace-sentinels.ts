import * as fs from "node:fs";
import * as path from "node:path";
import { fileToUri } from "@mrclrchtr/supi-core/path";
import { FileChangeType, type FileEvent } from "../config/types.ts";
import {
  type AutomaticLspPathPolicy,
  createDefaultAutomaticLspPathPolicy,
  walkAutomaticLspTree,
} from "../workspace-path-policy.ts";

const ROOT_LOCKFILES = ["pnpm-lock.yaml", "package-lock.json", "yarn.lock", "bun.lockb"];

export interface WorkspaceSentinelScanOptions {
  /** Runtime-owned automatic path policy. */
  policy?: AutomaticLspPathPolicy;
}

/** Build a fresh snapshot of workspace sentinel files and their mtimes. */
export function scanWorkspaceSentinels(
  cwd: string,
  options: WorkspaceSentinelScanOptions = {},
): Map<string, number> {
  const resolvedCwd = path.resolve(cwd);
  const snapshot = new Map<string, number>();

  if (!fs.existsSync(resolvedCwd)) return snapshot;

  const policy = options.policy ?? createDefaultAutomaticLspPathPolicy(resolvedCwd);
  walkAutomaticLspTree(policy, resolvedCwd, Number.MAX_SAFE_INTEGER, (directory, entries) => {
    for (const entry of entries) {
      if (!entry.isFile() && !entry.isSymbolicLink()) continue;
      const filePath = path.join(directory, entry.name);
      if (!isWorkspaceSentinelPath(filePath, resolvedCwd)) continue;
      try {
        snapshot.set(filePath, fs.statSync(filePath).mtimeMs);
      } catch {
        // File deleted between readdir and stat — skip.
      }
    }
  });

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

/** One policy-filtered workspace inventory refresh. */
export interface WorkspaceSentinelSyncResult {
  snapshot: Map<string, number>;
  changes: FileEvent[];
}

/** Refresh a previous sentinel snapshot and return its change events. */
export function syncWorkspaceSentinelSnapshot(
  cwd: string,
  previous: Map<string, number>,
  options: WorkspaceSentinelScanOptions = {},
): WorkspaceSentinelSyncResult {
  const snapshot = scanWorkspaceSentinels(cwd, options);
  return { snapshot, changes: diffWorkspaceSentinelSnapshot(previous, snapshot) };
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
