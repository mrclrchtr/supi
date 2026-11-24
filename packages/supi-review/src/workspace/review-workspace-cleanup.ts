import {
  type AgentWorkspaceOwnerStatus,
  listAgentWorkspaces,
  removeAgentWorkspace,
} from "@mrclrchtr/supi-agent-runtime/workspace";
import { resolveGitRepositoryRoot } from "../git-command.ts";

/** Advisory owner status derived from the PID encoded in a marked Git worktree lock. */
export type ReviewWorkspaceOwnerStatus = AgentWorkspaceOwnerStatus;

/** One SuPi-marked linked worktree available for explicit cleanup. */
export interface ReviewWorkspaceCleanupCandidate {
  workspacePath: string;
  owner: ReviewWorkspaceOwnerStatus;
}

/** Per-candidate result from explicit Review Workspace cleanup. */
export type ReviewWorkspaceRemovalResult =
  | { workspacePath: string; removed: true }
  | { workspacePath: string; removed: false; message: string };

/**
 * List only Review-owned Agent Workspaces for the current repository: new `supi-agent:review:`
 * markers and legacy `supi-review:` markers.
 */
export async function listReviewWorkspaces(
  cwd: string,
): Promise<ReviewWorkspaceCleanupCandidate[]> {
  const root = await resolveGitRepositoryRoot(cwd);
  const entries = await listAgentWorkspaces(root);
  return entries.flatMap((entry) =>
    entry.owner === "review" ? [{ workspacePath: entry.path, owner: entry.ownerStatus }] : [],
  );
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
  const removal = await removeAgentWorkspace(root, candidate.workspacePath);
  if (removal.outcome === "removed")
    return { workspacePath: candidate.workspacePath, removed: true };
  if (removal.outcome === "unlocked") {
    return {
      workspacePath: candidate.workspacePath,
      removed: false,
      message: "This worktree was not created by a Review; it was unlocked and kept.",
    };
  }
  if (removal.reason === "not-marked") {
    return {
      workspacePath: candidate.workspacePath,
      removed: false,
      message: "Review Workspace is no longer a marked cleanup candidate.",
    };
  }
  return {
    workspacePath: candidate.workspacePath,
    removed: false,
    message:
      "Git could not remove this Review Workspace; run git worktree remove --force manually.",
  };
}
