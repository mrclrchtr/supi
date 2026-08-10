import { lstat } from "node:fs/promises";
import { literalPathspec, runGit, runGitAllowExit } from "./git-command.ts";
import { REVIEW_LIMITS } from "./review-limits.ts";
import {
  normalizeRepositoryRelativePath,
  normalizeReviewPathArgument,
  resolveReviewPath,
} from "./review-path.ts";
import type { ReviewScope, ReviewSnapshot } from "./types.ts";

function quotedPath(path: string): string {
  return JSON.stringify(path);
}

function isMissingPath(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    ((error as { code?: unknown }).code === "ENOENT" ||
      (error as { code?: unknown }).code === "ENOTDIR")
  );
}

/**
 * Normalize the optional batch Review Scope before target resolution.
 *
 * Scope paths are repository-relative only. This function does not test path
 * existence because that must use the frozen after state.
 */
export function normalizeReviewScope(scope: ReviewScope | undefined): ReviewScope {
  const paths = scope?.paths;
  if (!paths?.length) return {};
  if (paths.length > REVIEW_LIMITS.reviewScopePathsPerTarget) {
    throw new Error(
      `Review Scope may list at most ${REVIEW_LIMITS.reviewScopePathsPerTarget} paths.`,
    );
  }

  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const rawPath of paths) {
    const path = rawPath.trim();
    if (!path) throw new Error("Review Scope paths must not be blank.");
    if (path.length > REVIEW_LIMITS.reviewScopePathCharacters) {
      throw new Error(
        `Review Scope paths must not exceed ${REVIEW_LIMITS.reviewScopePathCharacters.toLocaleString("en-US")} characters.`,
      );
    }
    const safePath = normalizeRepositoryRelativePath(normalizeReviewPathArgument(path));
    // A trailing slash is equivalent for a Review Scope directory path.
    const canonicalPath = safePath.endsWith("/") ? safePath.slice(0, -1) : safePath;
    if (!seen.has(canonicalPath)) {
      seen.add(canonicalPath);
      normalized.push(canonicalPath);
    }
  }
  return { paths: normalized };
}

/** Format the normalized advisory scope for the Planner Draft input. */
export function formatReviewScopeForPlanner(scope: ReviewScope): string[] {
  const paths = scope.paths;
  if (!paths?.length) return ["Review Scope: repository-wide review."];
  return [
    "## Review Scope",
    "Advisory path focus:",
    ...paths.map((path) => `- ${JSON.stringify(path)}`),
    "This scope is not Review Criteria or an access boundary. It does not restrict repository inspection.",
  ];
}

async function hasFrozenAfterPath(
  workspaceCwd: string,
  path: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const tracked = await runGit(
    workspaceCwd,
    literalPathspec(["ls-files", "--cached", "-z", "--", path]),
    undefined,
    signal,
  );
  return tracked.length > 0;
}

async function sourcePathExists(snapshot: ReviewSnapshot, path: string): Promise<boolean> {
  try {
    await lstat(resolveReviewPath(snapshot.repositoryRoot, path).absolute);
    return true;
  } catch (error) {
    if (isMissingPath(error)) return false;
    throw error;
  }
}

async function sourcePathIsIgnored(
  snapshot: ReviewSnapshot,
  path: string,
  signal?: AbortSignal,
): Promise<boolean> {
  // check-ignore does not support --literal-pathspecs. This prefix prevents pathspec magic.
  const ignored = await runGitAllowExit(
    snapshot.repositoryRoot,
    ["check-ignore", "--no-index", "--", `./${path}`],
    [1],
    { signal },
  );
  return ignored.length > 0;
}

async function pathExistsAtCommit(
  snapshot: ReviewSnapshot,
  path: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const type = await runGitAllowExit(
    snapshot.repositoryRoot,
    ["cat-file", "-t", "--", `${snapshot.target.toCommit}:${path}`],
    [1, 128],
    { signal },
  );
  return type.trim().length > 0;
}

async function missingFilesystemScopeReason(
  snapshot: ReviewSnapshot,
  path: string,
  signal?: AbortSignal,
): Promise<string> {
  if (await sourcePathExists(snapshot, path)) {
    if (await sourcePathIsIgnored(snapshot, path, signal)) {
      return `Review Scope path ${quotedPath(path)} is ignored untracked content and is not in the frozen after state.`;
    }
  } else if (await pathExistsAtCommit(snapshot, path, signal)) {
    return `Review Scope path ${quotedPath(path)} was deleted from the frozen after state. Select a surviving parent directory instead.`;
  }
  return `Review Scope path ${quotedPath(path)} does not exist in the frozen after state.`;
}

/**
 * Validate Review Scope paths in the materialized frozen after state.
 *
 * The Review Workspace index contains only Target Evidence, so this rejects
 * worktree administration files and ignored untracked source content. For a
 * filesystem target, source checks only improve the error for ignored or
 * deleted paths; path authority stays with the frozen workspace.
 */
export async function validateReviewScope(
  snapshot: ReviewSnapshot,
  workspaceCwd: string,
  scope: ReviewScope | undefined,
  signal?: AbortSignal,
): Promise<ReviewScope> {
  const normalized = normalizeReviewScope(scope);
  for (const path of normalized.paths ?? []) {
    if (await hasFrozenAfterPath(workspaceCwd, path, signal)) continue;
    const reason = snapshot.target.includeUncommittedChanges
      ? await missingFilesystemScopeReason(snapshot, path, signal)
      : `Review Scope path ${quotedPath(path)} does not exist at resolved after commit ${snapshot.target.toCommit}.`;
    throw new Error(reason);
  }
  return normalized;
}
