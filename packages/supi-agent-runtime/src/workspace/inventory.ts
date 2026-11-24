import { realpath, rm } from "node:fs/promises";
import { basename, dirname } from "node:path";
import {
  DISPOSABLE_PARENT_PREFIX,
  DISPOSABLE_WORKSPACE_NAME,
  LEGACY_DISPOSABLE_PARENT_PREFIX,
} from "./disposable.ts";
import { runGit, runGitAllowFatal } from "./git.ts";
import { markerOwnerStatus, parseAgentWorkspaceMarker } from "./marker.ts";
import type { AgentWorkspaceOwnerStatus } from "./types.ts";
import { listWorktrees } from "./worktrees.ts";

/** One SuPi-marked worktree from Git's worktree inventory. */
export interface AgentWorkspaceEntry {
  /** Canonical worktree path. */
  path: string;
  /** Owner named by the marker (`review` for legacy markers); undefined when unreadable. */
  owner?: string;
  /** True for a legacy `supi-review:` marker. */
  legacy: boolean;
  ownerStatus: AgentWorkspaceOwnerStatus;
  /** True when removal deletes the worktree; false when it only unlocks a caller-provided one. */
  disposable: boolean;
  lockReason: string;
}

/** Outcome of {@link removeAgentWorkspace} for one path. */
export type AgentWorkspaceRemoval =
  | { path: string; outcome: "removed" }
  | { path: string; outcome: "unlocked" }
  | { path: string; outcome: "failed"; reason: "not-marked" | "git-failed" };

/**
 * Temporary parent of a disposable workspace, recognized by its `mkdtemp` prefix and the fixed
 * worktree name so cleanup never deletes an unrelated directory. It does not depend on the current
 * temporary directory, which may differ from the one the workspace was created under.
 */
async function disposableParent(path: string): Promise<string | undefined> {
  if (basename(path) !== DISPOSABLE_WORKSPACE_NAME) return undefined;
  const parent = dirname(path);
  const canonicalParent = await realpath(parent).catch(() => parent);
  const name = basename(canonicalParent);
  return name.startsWith(DISPOSABLE_PARENT_PREFIX) ||
    name.startsWith(LEGACY_DISPOSABLE_PARENT_PREFIX)
    ? canonicalParent
    : undefined;
}

/**
 * List the SuPi-marked worktrees of the repository containing `cwd`, including legacy
 * `supi-review:` markers. Owner status is advisory because process ids can be reused.
 */
export async function listAgentWorkspaces(
  cwd: string,
  signal?: AbortSignal,
): Promise<AgentWorkspaceEntry[]> {
  const records = await listWorktrees(cwd, signal);
  const entries: AgentWorkspaceEntry[] = [];
  for (const record of records) {
    if (record.lockReason === undefined) continue;
    const marker = parseAgentWorkspaceMarker(record.lockReason);
    if (!marker) continue;
    entries.push({
      path: record.path,
      ...(marker.owner ? { owner: marker.owner } : {}),
      legacy: marker.legacy,
      ownerStatus: markerOwnerStatus(marker),
      disposable: marker.disposable,
      lockReason: record.lockReason,
    });
  }
  return entries;
}

/**
 * Clean up one SuPi-marked worktree after re-reading the inventory. A disposable workspace is
 * unlocked and removed with its temporary parent; a caller-provided worktree is only unlocked.
 * Owner status is not checked: deciding whether an active owner may be cleaned up is caller policy.
 */
export async function removeAgentWorkspace(
  cwd: string,
  path: string,
): Promise<AgentWorkspaceRemoval> {
  const entry = (await listAgentWorkspaces(cwd)).find((candidate) => candidate.path === path);
  if (!entry) return { path, outcome: "failed", reason: "not-marked" };
  try {
    await runGitAllowFatal(cwd, ["worktree", "unlock", path]);
    if (!entry.disposable) return { path, outcome: "unlocked" };
    const parent = await disposableParent(path);
    await runGit(cwd, ["worktree", "remove", "--force", path]);
    if (parent) await rm(parent, { recursive: true, force: true });
    return { path, outcome: "removed" };
  } catch {
    return { path, outcome: "failed", reason: "git-failed" };
  }
}
