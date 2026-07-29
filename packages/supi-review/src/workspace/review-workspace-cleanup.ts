import { realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname } from "node:path";
import { resolveGitRepositoryRoot, runGit, runGitAllowExit } from "../git-command.ts";
import { REVIEW_WORKSPACE_MARKER } from "./review-workspace.ts";

/** Advisory owner status derived from the PID encoded in a marked Git worktree lock. */
export type ReviewWorkspaceOwnerStatus = "active" | "absent" | "unknown";

/** One SuPi-marked linked worktree available for explicit cleanup. */
export interface ReviewWorkspaceCleanupCandidate {
  workspacePath: string;
  owner: ReviewWorkspaceOwnerStatus;
}

/** Per-candidate result from explicit Review Workspace cleanup. */
export type ReviewWorkspaceRemovalResult =
  | { workspacePath: string; removed: true }
  | { workspacePath: string; removed: false; message: string };

interface WorktreeRecord {
  workspacePath?: string;
  lockReason?: string;
}

function parseWorktreeRecords(text: string): WorktreeRecord[] {
  const records: WorktreeRecord[] = [];
  let current: WorktreeRecord = {};
  for (const line of text.split("\n")) {
    if (!line) {
      if (current.workspacePath) records.push(current);
      current = {};
      continue;
    }
    if (line.startsWith("worktree ")) current.workspacePath = line.slice("worktree ".length);
    if (line.startsWith("locked ")) current.lockReason = line.slice("locked ".length);
  }
  if (current.workspacePath) records.push(current);
  return records;
}

async function disposableWorkspaceParent(workspacePath: string): Promise<string | undefined> {
  const parent = dirname(workspacePath);
  const [tempRoot, canonicalParent] = await Promise.all([
    realpath(tmpdir()).catch(() => tmpdir()),
    realpath(parent).catch(() => parent),
  ]);
  return dirname(canonicalParent) === tempRoot &&
    basename(canonicalParent).startsWith("supi-review-workspace-")
    ? canonicalParent
    : undefined;
}

function ownerStatus(reason: string): ReviewWorkspaceOwnerStatus {
  const pid = /^supi-review:[^;]+;pid=(\d+);started=/.exec(reason)?.[1];
  if (!pid) return "unknown";
  try {
    process.kill(Number(pid), 0);
    return "active";
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ESRCH" ? "absent" : "unknown";
  }
}

/** List only SuPi-marked linked Review Workspaces for the current repository. */
export async function listReviewWorkspaces(
  cwd: string,
): Promise<ReviewWorkspaceCleanupCandidate[]> {
  const root = await resolveGitRepositoryRoot(cwd);
  const records = parseWorktreeRecords(await runGit(root, ["worktree", "list", "--porcelain"]));
  return records.flatMap((record) => {
    if (!record.workspacePath || !record.lockReason?.startsWith(REVIEW_WORKSPACE_MARKER)) return [];
    return [{ workspacePath: record.workspacePath, owner: ownerStatus(record.lockReason) }];
  });
}

/** Remove one freshly revalidated marked Review Workspace without touching unrelated worktrees. */
export async function removeReviewWorkspace(
  cwd: string,
  candidate: ReviewWorkspaceCleanupCandidate,
): Promise<ReviewWorkspaceRemovalResult> {
  const root = await resolveGitRepositoryRoot(cwd);
  const available = await listReviewWorkspaces(root);
  if (!available.some((item) => item.workspacePath === candidate.workspacePath)) {
    return {
      workspacePath: candidate.workspacePath,
      removed: false,
      message: "Review Workspace is no longer a marked cleanup candidate.",
    };
  }
  try {
    await runGitAllowExit(root, ["worktree", "unlock", candidate.workspacePath], [128]);
    await runGit(root, ["worktree", "remove", "--force", candidate.workspacePath]);
    const parent = await disposableWorkspaceParent(candidate.workspacePath);
    if (parent) await rm(parent, { recursive: true, force: true });
    return { workspacePath: candidate.workspacePath, removed: true };
  } catch {
    return {
      workspacePath: candidate.workspacePath,
      removed: false,
      message:
        "Git could not remove this Review Workspace; run git worktree remove --force manually.",
    };
  }
}
