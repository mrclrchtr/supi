// Generic session-file tree-walking utilities.

import type { FileEntry, SessionEntry } from "@earendil-works/pi-coding-agent";

/**
 * Minimal pi API surface needed to track the current session display name reactively.
 * Accept `ExtensionAPI` or any object satisfying this shape.
 */
export interface SessionNameTrackerHost {
  on(event: string, handler: (...args: unknown[]) => unknown): void;
  getSessionName(): string | undefined;
}

/**
 * Create a reactive session-name tracker that stays consistent across
 * session starts, renames, and shutdowns without polling.
 *
 * Subscribes to `session_start` (initial name), `session_info_changed`
 * (renames via `/name`, `pi.setSessionName()`, or RPC), and
 * `session_shutdown` (reset to `undefined`).
 *
 * @returns a zero-arg getter that always returns the current session name
 *
 * @example
 * ```ts
 * const getSessionName = createSessionNameTracker(pi);
 * // …later, during tool execute or spinner rendering:
 * const name = getSessionName();
 * ```
 */
export function createSessionNameTracker(pi: SessionNameTrackerHost): () => string | undefined {
  let name: string | undefined;

  pi.on("session_start", () => {
    name = pi.getSessionName();
  });
  pi.on("session_info_changed", (event) => {
    name = (event as { name?: string }).name;
  });
  pi.on("session_shutdown", () => {
    name = undefined;
  });

  return () => name;
}

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
