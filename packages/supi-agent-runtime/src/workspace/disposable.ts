import { createHash } from "node:crypto";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runGit, runGitAllowFatal } from "./git.ts";
import { createAgentWorkspaceMarker } from "./marker.ts";
import { AgentWorkspaceError, type AgentWorkspaceOwner } from "./types.ts";

/** Temporary parent directory prefix that marks a workspace as disposable. */
export const DISPOSABLE_PARENT_PREFIX = "supi-agent-workspace-";
/** Parent prefix used by Review before Agent Workspaces existed. */
export const LEGACY_DISPOSABLE_PARENT_PREFIX = "supi-review-workspace-";

/**
 * Neutral description of the Git state an Agent Workspace must reproduce.
 * The caller computes `patch` and `expectedHash`; the module never interprets them.
 */
export interface AgentWorkspaceState {
  /** Any worktree of the source repository. */
  repositoryRoot: string;
  /** Full commit id checked out detached; the observed head must equal it exactly. */
  baseCommit: string;
  /**
   * Binary patch staged with `git apply --index` over the base. When omitted, the checkout must be
   * clean. Its SHA-256 must equal `expectedHash` before any worktree is created.
   */
  patch?: Buffer;
  /** Lowercase hex SHA-256 the caller's `readPatch` must reproduce from the workspace. */
  expectedHash: string;
}

/** Neutral evidence that a disposable workspace matches its state description. */
export interface AgentWorkspaceReceipt {
  baseCommit: string;
  observedHead: string;
  expectedHash: string;
  observedHash: string;
  /** True when a non-empty patch was staged over the base. */
  patchApplied: boolean;
}

/** Facts for manual recovery when a workspace could not be released. */
export interface AgentWorkspaceReleaseFailure {
  workspacePath: string;
  /** Shell command that removes the worktree and its temporary parent. */
  recoveryCommand: string;
}

/** A created, locked, and verified disposable linked worktree. */
export interface DisposableAgentWorkspace {
  /** Canonical path of the worktree. */
  cwd: string;
  /** Temporary directory that contains the worktree; callers may write files beside it. */
  parentDirectory: string;
  receipt: AgentWorkspaceReceipt;
  /**
   * Unlock and remove the worktree and its temporary parent. Idempotent. Resolves to recovery
   * facts instead of throwing when Git or the filesystem refuses.
   */
  release(): Promise<AgentWorkspaceReleaseFailure | undefined>;
}

/** Input for {@link createDisposableWorkspace}. */
export interface CreateDisposableWorkspaceOptions {
  owner: AgentWorkspaceOwner;
  state: AgentWorkspaceState;
  /**
   * Re-read the workspace through the caller's canonical patch compiler. Its SHA-256 must equal
   * `state.expectedHash`.
   */
  readPatch(cwd: string, signal?: AbortSignal): Promise<Buffer>;
  signal?: AbortSignal;
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"")}'`;
}

async function verifyWorkspace(
  options: CreateDisposableWorkspaceOptions,
  cwd: string,
): Promise<AgentWorkspaceReceipt> {
  const { state, signal } = options;
  const observedHead = (
    await runGit(
      cwd,
      // biome-ignore lint/security/noSecrets: Git revision syntax, not a secret
      ["rev-parse", "--verify", "HEAD^{commit}"],
      signal,
    )
  ).trim();
  if (observedHead !== state.baseCommit) {
    throw new AgentWorkspaceError("unexpected-head", "Workspace checked out an unexpected commit.");
  }
  if (state.patch === undefined) {
    const status = await runGit(cwd, ["status", "--porcelain"], signal);
    if (status)
      throw new AgentWorkspaceError("not-clean", "Workspace was not clean after checkout.");
  }
  const observedHash = sha256(await options.readPatch(cwd, signal));
  if (observedHash !== state.expectedHash) {
    throw new AgentWorkspaceError("hash-mismatch", "Workspace does not match the expected patch.");
  }
  return {
    baseCommit: state.baseCommit,
    observedHead,
    expectedHash: state.expectedHash,
    observedHash,
    patchApplied: (state.patch?.length ?? 0) > 0,
  };
}

async function removeWorktree(repositoryRoot: string, cwd: string): Promise<void> {
  await runGitAllowFatal(repositoryRoot, ["worktree", "unlock", cwd]);
  await runGit(repositoryRoot, ["worktree", "remove", "--force", cwd]);
}

/**
 * Create a disposable linked worktree in a fresh temporary parent, detached at
 * `state.baseCommit`, locked with a `supi-agent:<owner>:` marker, optionally with `state.patch`
 * staged, and verified against `state.expectedHash`. Any failure removes what was created and
 * rejects; refused states reject with an {@link AgentWorkspaceError}.
 */
export async function createDisposableWorkspace(
  options: CreateDisposableWorkspaceOptions,
): Promise<DisposableAgentWorkspace> {
  const { state, signal } = options;
  signal?.throwIfAborted();
  if (state.patch !== undefined && sha256(state.patch) !== state.expectedHash) {
    throw new AgentWorkspaceError("patch-mismatch", "The patch does not match its expected hash.");
  }
  const parentDirectory = await realpath(await mkdtemp(join(tmpdir(), DISPOSABLE_PARENT_PREFIX)));
  let cwd = join(parentDirectory, "workspace");
  let created = false;
  let receipt: AgentWorkspaceReceipt;
  try {
    await runGit(
      state.repositoryRoot,
      ["worktree", "add", "--detach", cwd, state.baseCommit],
      signal,
    );
    created = true;
    cwd = await realpath(cwd);
    await runGit(
      state.repositoryRoot,
      ["worktree", "lock", "--reason", createAgentWorkspaceMarker(options.owner), cwd],
      signal,
    );
    if (state.patch && state.patch.length > 0) {
      const patchPath = join(parentDirectory, "workspace.patch");
      await writeFile(patchPath, state.patch, { signal });
      await runGit(cwd, ["apply", "--index", "--binary", "--whitespace=nowarn", patchPath], signal);
      await rm(patchPath, { force: true });
    }
    receipt = await verifyWorkspace(options, cwd);
  } catch (error) {
    if (created) await removeWorktree(state.repositoryRoot, cwd).catch(() => undefined);
    await rm(parentDirectory, { recursive: true, force: true });
    throw error;
  }

  let released = false;
  return {
    cwd,
    parentDirectory,
    receipt,
    async release() {
      if (released) return undefined;
      released = true;
      try {
        await removeWorktree(state.repositoryRoot, cwd);
        await rm(parentDirectory, { recursive: true, force: true });
        return undefined;
      } catch {
        return {
          workspacePath: cwd,
          recoveryCommand: `git worktree remove --force ${shellQuote(cwd)} && rm -rf ${shellQuote(parentDirectory)}`,
        };
      }
    },
  };
}
