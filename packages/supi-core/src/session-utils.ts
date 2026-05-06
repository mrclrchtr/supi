// Generic session-file tree-walking utilities.

import type { FileEntry, SessionEntry } from "@mariozechner/pi-coding-agent";

/**
 * Resolve the active branch path using PI's append-only tree semantics.
 *
 * The active branch is the path from the **last entry** (current leaf)
 * back to the root via `parentId`. This follows PI's tree structure where
 * entries are append-only and the last entry in the file is always the
 * current leaf of the active branch.
 */
export function getActiveBranchEntries(entries: FileEntry[]): SessionEntry[] {
  const sessionEntries = entries.filter((e): e is SessionEntry => e.type !== "session");
  const byId = new Map(sessionEntries.map((entry) => [entry.id, entry]));
  const leaf = sessionEntries.at(-1);
  if (!leaf) return [];

  const path: SessionEntry[] = [];
  const visited = new Set<string>();
  let current: SessionEntry | undefined = leaf;
  while (current) {
    if (visited.has(current.id)) break;
    visited.add(current.id);
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}
