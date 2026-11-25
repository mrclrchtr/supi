import { randomBytes } from "node:crypto";
import {
  createLinkedWorktree,
  hasUncommittedChanges,
  type LinkedAgentWorkspace,
  mainWorktreeRoot,
  resolveCommit,
  runDependencyBootstrap,
} from "@mrclrchtr/supi-agent-runtime/workspace";
import type { CreatedWorktreeSummary } from "../tool/agent_run/batch-types.ts";
import type { AgentRunTaskInput, AgentRunToolParams } from "../tool/agent_run/schema.ts";

/** One Agent Workspace that `agent_run` created for a writer task. */
export interface CreatedWorktree {
  readonly taskId: string;
  readonly workspace: LinkedAgentWorkspace;
  readonly summary: CreatedWorktreeSummary;
}

/** Created worktrees of one batch, and the batch input that points each task at its worktree. */
export interface CreatedWorktreeSet {
  /** Input with `new.cwd` set to each created root and `new.worktree` removed. */
  readonly params: AgentRunToolParams;
  /** Created worktrees by task ID. */
  readonly byTask: ReadonlyMap<string, CreatedWorktree>;
  /** Remove every created worktree and its unmoved branch, unless kept. Never throws. */
  discard(): Promise<void>;
  /** Keep the worktrees from now on; call once runs may have started in them. */
  keep(): void;
}

/** Task IDs that request `new.worktree`. */
export function worktreeRequestIds(params: AgentRunToolParams): Set<string> {
  return new Set(
    params.tasks.flatMap((task) => ("new" in task && task.new.worktree ? [task.id] : [])),
  );
}

/** Reject a task that combines `new.worktree` with `new.cwd`. */
export function worktreeRequestErrors(params: AgentRunToolParams): string[] {
  return params.tasks.flatMap((task) =>
    "new" in task && task.new.worktree && task.new.cwd !== undefined
      ? [`${task.id}: new.worktree and new.cwd exclude each other; set only one.`]
      : [],
  );
}

/** Replace every run of characters outside `[A-Za-z0-9._-]` with `-`. */
function safeName(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-");
}

/** Task part of a default branch name: Git-safe characters only, bounded length. */
function branchSlug(taskId: string): string {
  const slug = safeName(taskId)
    .replace(/\.{2,}/g, ".")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 40)
    .replace(/[-.]+$/g, "");
  return slug || "task";
}

/** Default branch for a created worktree: `supi/<task id>-<6 hex>`, unique across runs. */
export function defaultWorktreeBranch(taskId: string): string {
  return `supi/${branchSlug(taskId)}-${randomBytes(3).toString("hex")}`;
}

/** Sibling path of the main worktree, Worktrunk style: `<main>.<branch with / as ->`. */
export function siblingWorktreePath(mainRoot: string, branch: string): string {
  return `${mainRoot}.${safeName(branch)}`;
}

async function resolveBase(
  taskId: string,
  cwd: string,
  base: string,
  signal?: AbortSignal,
): Promise<string> {
  const commit = await resolveCommit(cwd, base, signal);
  if (commit === undefined) {
    throw new Error(
      `${taskId}: new.worktree.base "${base}" does not name a commit in the parent's repository.`,
    );
  }
  return commit;
}

/** Inputs of {@link createRequestedWorktrees}. */
export interface CreateRequestedWorktreesOptions {
  readonly params: AgentRunToolParams;
  /** Parent cwd; bases resolve here, and its uncommitted state is reported. */
  readonly parentCwd: string;
  /** Configured Dependency Bootstrap; runs once in each created worktree when non-empty. */
  readonly bootstrapCommand?: string;
  readonly signal?: AbortSignal;
}

/**
 * Create one Agent Workspace per task that requests `new.worktree`: a linked worktree next to
 * the main worktree on a new branch, leased from creation. Then run the configured Dependency
 * Bootstrap in each. On any failure, remove what was created and reject; nothing is left behind.
 */
export async function createRequestedWorktrees(
  options: CreateRequestedWorktreesOptions,
): Promise<CreatedWorktreeSet> {
  const { params, parentCwd, signal } = options;
  const created = new Map<string, CreatedWorktree>();
  let kept = false;
  const discard = async () => {
    if (kept) return;
    await Promise.allSettled([...created.values()].map((entry) => entry.workspace.discard()));
  };
  try {
    const mainRoot = await mainWorktreeRoot(parentCwd, signal);
    const parentUncommitted = await hasUncommittedChanges(parentCwd, signal);
    const bases = new Map<string, string>();
    const tasks: AgentRunTaskInput[] = [];
    for (const task of params.tasks) {
      const request = "new" in task ? task.new.worktree : undefined;
      if (!("new" in task) || !request) {
        tasks.push(task);
        continue;
      }
      const baseRef = request.base ?? "HEAD";
      let baseCommit = bases.get(baseRef);
      if (baseCommit === undefined) {
        baseCommit = await resolveBase(task.id, parentCwd, baseRef, signal);
        bases.set(baseRef, baseCommit);
      }
      const branch = request.branch ?? defaultWorktreeBranch(task.id);
      const workspace = await createLinkedWorktree({
        repositoryRoot: parentCwd,
        baseCommit,
        branch,
        path: siblingWorktreePath(mainRoot, branch),
        owner: "delegation",
        ...(signal ? { signal } : {}),
      }).catch((error: unknown) => {
        throw new Error(
          `${task.id}: Could not create its worktree: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
      created.set(task.id, {
        taskId: task.id,
        workspace,
        summary: { branch: workspace.branch, baseCommit: workspace.baseCommit, parentUncommitted },
      });
      const { worktree: _worktree, ...rest } = task.new;
      tasks.push({ ...task, new: { ...rest, cwd: workspace.root } });
    }
    await bootstrap(created, options.bootstrapCommand, signal);
    return {
      params: { ...params, tasks },
      byTask: created,
      discard,
      keep: () => {
        kept = true;
      },
    };
  } catch (error) {
    await discard();
    throw error;
  }
}

async function bootstrap(
  created: ReadonlyMap<string, CreatedWorktree>,
  command: string | undefined,
  signal?: AbortSignal,
): Promise<void> {
  if (!command?.trim()) return;
  for (const entry of created.values()) {
    try {
      await runDependencyBootstrap(entry.workspace.root, command, signal);
    } catch (error) {
      signal?.throwIfAborted();
      throw new Error(`${entry.taskId}: Configured Dependency Bootstrap failed.`, {
        cause: error,
      });
    }
  }
}
