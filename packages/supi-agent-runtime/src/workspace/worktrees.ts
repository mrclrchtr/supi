import { realpath } from "node:fs/promises";
import { runGit } from "./git.ts";

/** One entry of `git worktree list --porcelain`, with a canonical path when it still exists. */
export interface WorktreeRecord {
  path: string;
  lockReason?: string;
}

function parseWorktreeRecords(text: string): WorktreeRecord[] {
  const records: WorktreeRecord[] = [];
  let current: Partial<WorktreeRecord> = {};
  const flush = () => {
    if (current.path) records.push(current as WorktreeRecord);
    current = {};
  };
  for (const line of text.split("\n")) {
    if (!line) {
      flush();
      continue;
    }
    if (line.startsWith("worktree ")) current.path = line.slice("worktree ".length);
    if (line.startsWith("locked")) current.lockReason = line.slice("locked ".length);
  }
  flush();
  return records;
}

/**
 * List the repository's worktrees; the first record is the main worktree.
 * Paths are canonicalized so they compare equal to resolved roots.
 */
export async function listWorktrees(cwd: string, signal?: AbortSignal): Promise<WorktreeRecord[]> {
  const records = parseWorktreeRecords(
    await runGit(cwd, ["worktree", "list", "--porcelain"], signal),
  );
  return Promise.all(
    records.map(async (record) => ({
      ...record,
      path: await realpath(record.path).catch(() => record.path),
    })),
  );
}

/**
 * Resolve the canonical root of the worktree that contains `cwd`: Git's top level plus `realpath`,
 * so a subdirectory or a symlink alias resolves to the same root.
 */
export async function resolveWorktreeRoot(cwd: string, signal?: AbortSignal): Promise<string> {
  const root = (await runGit(cwd, ["rev-parse", "--show-toplevel"], signal)).trim();
  if (!root) throw new Error(`No Git worktree contains ${cwd}.`);
  return realpath(root);
}

/** Canonical root of a worktree and whether it is a linked worktree. */
export interface WorktreeDescription {
  /** Canonical worktree root, as returned by {@link resolveWorktreeRoot}. */
  root: string;
  /** True for a linked worktree, which Git can lock; false for the main worktree. */
  linked: boolean;
}

/**
 * Describe the worktree that contains `cwd`. Rejects when no Git worktree contains it. The main
 * worktree is the first entry of `git worktree list`; every other entry is linked.
 */
export async function describeWorktree(
  cwd: string,
  signal?: AbortSignal,
): Promise<WorktreeDescription> {
  const root = await resolveWorktreeRoot(cwd, signal);
  const [main] = await listWorktrees(root, signal);
  return { root, linked: main !== undefined && main.path !== root };
}
