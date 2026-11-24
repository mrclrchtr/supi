import { lstat, realpath } from "node:fs/promises";
import { runGit, runGitAllowFatal } from "./git.ts";
import { ownedLease, type WorktreeLease } from "./lease.ts";
import { createAgentWorkspaceMarker } from "./marker.ts";
import { AgentWorkspaceError, type AgentWorkspaceOwner } from "./types.ts";
import { listWorktrees } from "./worktrees.ts";

/** Upper bound for `git worktree add`, which runs the repository's `post-checkout` hooks. */
const WORKTREE_ADD_TIMEOUT_MS = 10 * 60_000;

/** Input for {@link createLinkedWorktree}. */
export interface CreateLinkedWorktreeOptions {
  /** Any worktree of the source repository. */
  repositoryRoot: string;
  /** Full commit id the new branch starts at. */
  baseCommit: string;
  /** New local branch; it must not exist yet. */
  branch: string;
  /** Absolute path of the new worktree; it must not exist yet. */
  path: string;
  owner: AgentWorkspaceOwner;
  signal?: AbortSignal;
}

/** A created, leased linked worktree on a new branch that outlives its lease. */
export interface LinkedAgentWorkspace {
  /** Canonical worktree root. */
  root: string;
  branch: string;
  baseCommit: string;
  /** The lock written at creation; releasing it unlocks and keeps the worktree. */
  lease: WorktreeLease;
  /**
   * Undo the creation before any work happened: unlock and remove the worktree, and delete the
   * branch while it still points at the base commit. Never throws.
   */
  discard(): Promise<void>;
}

/** In-process queue per Git common directory; parallel `worktree add` contend on shared files. */
const creationQueues = new Map<string, Promise<unknown>>();

async function serialized<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = creationQueues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  const tail = next.catch(() => undefined);
  creationQueues.set(key, tail);
  try {
    return await next;
  } finally {
    if (creationQueues.get(key) === tail) creationQueues.delete(key);
  }
}

async function commonDirectory(cwd: string, signal?: AbortSignal): Promise<string> {
  const path = (
    await runGit(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"], signal)
  ).trim();
  return realpath(path).catch(() => path);
}

/** Commit a local branch points at; undefined when it does not exist. */
async function branchTip(cwd: string, branch: string): Promise<string | undefined> {
  return runGit(cwd, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]).then(
    (output) => output.trim() || undefined,
    () => undefined,
  );
}

async function pathExists(path: string): Promise<boolean> {
  return lstat(path).then(
    () => true,
    () => false,
  );
}

async function assertCreatable(options: CreateLinkedWorktreeOptions): Promise<void> {
  const { repositoryRoot, branch, path, signal } = options;
  const valid = await runGit(repositoryRoot, ["check-ref-format", "--branch", branch], signal).then(
    () => true,
    () => false,
  );
  signal?.throwIfAborted();
  if (!valid) {
    throw new AgentWorkspaceError("invalid-branch", `"${branch}" is not a valid branch name.`);
  }
  if ((await branchTip(repositoryRoot, branch)) !== undefined) {
    throw new AgentWorkspaceError("branch-exists", `Branch ${branch} already exists.`);
  }
  if (await pathExists(path)) {
    throw new AgentWorkspaceError("path-exists", `Worktree path ${path} already exists.`);
  }
}

/**
 * Remove what this creation left behind; each step is best effort. Only a worktree that carries
 * this creation's `marker` is removed, so a concurrent creation of the same branch or path by
 * another process is never undone. The branch is deleted only while it still points at the base
 * and no other worktree has it checked out.
 */
async function undoCreation(
  options: Pick<CreateLinkedWorktreeOptions, "repositoryRoot" | "branch" | "baseCommit">,
  path: string,
  marker: string,
): Promise<void> {
  const { repositoryRoot, branch, baseCommit } = options;
  const canonical = await realpath(path).catch(() => path);
  const records = await listWorktrees(repositoryRoot).catch(() => undefined);
  if (!records) return;
  const own = records.find((record) => record.path === canonical && record.lockReason === marker);
  if (own) {
    await runGitAllowFatal(repositoryRoot, ["worktree", "unlock", canonical]).catch(
      () => undefined,
    );
    const removed = await runGit(repositoryRoot, ["worktree", "remove", "--force", canonical]).then(
      () => true,
      () => false,
    );
    if (!removed) return;
  }
  const ref = `refs/heads/${branch}`;
  const checkedOutElsewhere = records.some((record) => record !== own && record.branch === ref);
  // A branch that moved holds commits, and one checked out elsewhere belongs to that worktree.
  if (!checkedOutElsewhere && (await branchTip(repositoryRoot, branch)) === baseCommit) {
    await runGit(repositoryRoot, ["branch", "-D", branch]).catch(() => undefined);
  }
}

/**
 * Create a linked worktree at `path` on a new branch `branch` that starts at `baseCommit`, locked
 * from creation with a `supi-agent:<owner>:` lease (`git worktree add --lock`, so no other process
 * sees it unlocked). The branch gets no upstream (`--no-track`), so creation writes no Git config.
 * Creations of one repository run one after another within the process. Git runs the
 * repository's `post-checkout` hooks as part of the creation.
 *
 * Rejects with an {@link AgentWorkspaceError} (`invalid-branch`, `branch-exists`, `path-exists`)
 * before creating anything; any later failure, including an abort, removes what was created.
 * The worktree is never removed by releasing its lease; only {@link LinkedAgentWorkspace.discard}
 * removes it.
 */
export async function createLinkedWorktree(
  options: CreateLinkedWorktreeOptions,
): Promise<LinkedAgentWorkspace> {
  const { repositoryRoot, baseCommit, branch, path, signal } = options;
  signal?.throwIfAborted();
  const key = await commonDirectory(repositoryRoot, signal);
  return serialized(key, async () => {
    signal?.throwIfAborted();
    await assertCreatable(options);
    const marker = createAgentWorkspaceMarker(options.owner);
    try {
      await runGit(
        repositoryRoot,
        [
          "worktree",
          "add",
          "--lock",
          "--reason",
          marker,
          "--no-track",
          "-b",
          branch,
          "--",
          path,
          baseCommit,
        ],
        signal,
        WORKTREE_ADD_TIMEOUT_MS,
      );
      signal?.throwIfAborted();
    } catch (error) {
      await undoCreation(options, path, marker);
      throw error;
    }
    const root = await realpath(path);
    let discarded = false;
    return {
      root,
      branch,
      baseCommit,
      lease: ownedLease(root, marker),
      async discard() {
        if (discarded) return;
        discarded = true;
        await undoCreation(options, root, marker).catch(() => undefined);
      },
    };
  });
}
