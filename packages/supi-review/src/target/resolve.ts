import { lstat } from "node:fs/promises";
import {
  runGit as git,
  runGitAllowExit as gitAllowExit,
  resolveGitRepositoryRoot,
  withReviewIndex,
} from "../git-command.ts";
import { resolveReviewPath } from "../review-path.ts";
import type { ReviewSnapshot, ReviewSnapshotSummary, ReviewTargetSpec } from "../types.ts";
import {
  buildReviewChanges,
  createDiffAccumulator,
  untrackedPatchChange,
} from "./change-metadata.ts";
import { DIFF_FLAGS, diffUntrackedFile, parseNullList } from "./diff.ts";

async function resolveCommit(cwd: string, value: string): Promise<string | undefined> {
  const canonical = (await gitAllowExit(cwd, ["rev-parse", "--verify", value], [1, 128])).trim();
  if (!canonical) return undefined;
  const type = (await gitAllowExit(cwd, ["cat-file", "-t", canonical], [128])).trim();
  if (type !== "commit") return undefined;
  return canonical.toLowerCase();
}

async function headCommit(cwd: string): Promise<string | undefined> {
  const value = (
    await gitAllowExit(
      cwd,
      [
        "rev-parse",
        "--verify",
        // biome-ignore lint/security/noSecrets: Git revision syntax, not a secret
        "HEAD^{commit}",
      ],
      [1, 128],
    )
  ).trim();
  return value || undefined;
}

async function commitParent(cwd: string, commit: string): Promise<string | undefined> {
  const body = await git(cwd, ["cat-file", "-p", commit]);
  const parent = body.match(/^parent ([0-9a-f]+)$/m)?.[1];
  if (!parent) return undefined;
  const type = (await gitAllowExit(cwd, ["cat-file", "-t", parent], [128])).trim();
  if (type !== "commit") {
    throw new Error(`First parent ${parent} for ${commit} is unavailable.`);
  }
  return parent;
}

async function resolveWorkingTreeBase(
  cwd: string,
  requested: Extract<ReviewTargetSpec, { kind: "working-tree" }>,
  head: string,
): Promise<{
  baseline: string;
  requestedBaseCommit?: string;
  mergeBaseCommit?: string;
}> {
  if (!requested.baseCommit) return { baseline: head };
  const base = await resolveCommit(cwd, requested.baseCommit);
  if (!base) {
    throw new Error(`Commit ${requested.baseCommit.slice(0, 7)} not found in this repository.`);
  }
  const mergeBase = (await gitAllowExit(cwd, ["merge-base", base, head], [1])).trim();
  if (!mergeBase) {
    throw new Error(`No common ancestor between ${base.slice(0, 7)} and ${head.slice(0, 7)}.`);
  }
  return { baseline: mergeBase, requestedBaseCommit: base, mergeBaseCommit: mergeBase };
}

async function workingTreeSnapshot(
  cwd: string,
  requested: Extract<ReviewTargetSpec, { kind: "working-tree" }>,
): Promise<ReviewSnapshot | undefined> {
  const head = await headCommit(cwd);
  if (!head) return undefined;
  const base = await resolveWorkingTreeBase(cwd, requested, head);
  return withReviewIndex(cwd, head, base.baseline, async (indexFile) => {
    const [nameStatus, numstat, trackedDiff, untrackedText] = await Promise.all([
      git(cwd, ["diff", ...DIFF_FLAGS, "--name-status", "-z", base.baseline], indexFile),
      git(cwd, ["diff", ...DIFF_FLAGS, "--numstat", "-z", base.baseline], indexFile),
      git(cwd, ["diff", ...DIFF_FLAGS, base.baseline], indexFile),
      git(cwd, ["ls-files", "--others", "--exclude-standard", "-z"], indexFile),
    ]);
    const changes = buildReviewChanges(nameStatus, numstat);
    const diff = createDiffAccumulator();
    diff.append(trackedDiff);
    for (const path of parseNullList(untrackedText)) {
      const patch = await diffUntrackedFile(cwd, path);
      diff.append(patch);
      changes.push(untrackedPatchChange(path, patch));
    }
    changes.sort((left, right) => left.path.localeCompare(right.path));
    if (changes.length === 0) return undefined;

    return {
      repositoryRoot: cwd,
      requestedTarget: requested,
      target: {
        kind: "working-tree",
        headCommit: head,
        ...(base.requestedBaseCommit ? { requestedBaseCommit: base.requestedBaseCommit } : {}),
        ...(base.mergeBaseCommit ? { mergeBaseCommit: base.mergeBaseCommit } : {}),
      },
      title: base.mergeBaseCommit
        ? `Working tree changes ${base.mergeBaseCommit.slice(0, 7)}..filesystem`
        : "Working tree changes",
      changes,
      ...diff.finish(changes.length),
    };
  });
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

/** Validate advisory Review Scope paths against the frozen current filesystem. */
async function validateReviewScopePaths(
  root: string,
  paths: string[] | undefined,
): Promise<string[] | undefined> {
  if (!paths?.length) return undefined;
  const validated: string[] = [];
  const seen = new Set<string>();
  for (const path of paths) {
    const safe = resolveReviewPath(root, path);
    if (seen.has(safe.path)) continue;
    try {
      await lstat(safe.absolute);
    } catch (error) {
      if (isMissingPath(error)) {
        throw new Error(`Review Scope path does not exist in the current state: ${safe.path}`, {
          cause: error,
        });
      }
      throw error;
    }
    seen.add(safe.path);
    validated.push(safe.path);
  }
  return validated;
}

async function currentStateSnapshot(
  cwd: string,
  requested: Extract<ReviewTargetSpec, { kind: "current-state" }>,
): Promise<ReviewSnapshot> {
  const head = await headCommit(cwd);
  if (!head) throw new Error("Current-State Audit requires at least one commit.");
  const paths = await validateReviewScopePaths(cwd, requested.paths);
  return withReviewIndex(cwd, head, head, async (indexFile) => {
    const [nameStatus, numstat, trackedDiff, untrackedText] = await Promise.all([
      git(cwd, ["diff", ...DIFF_FLAGS, "--name-status", "-z", head], indexFile),
      git(cwd, ["diff", ...DIFF_FLAGS, "--numstat", "-z", head], indexFile),
      git(cwd, ["diff", ...DIFF_FLAGS, head], indexFile),
      git(cwd, ["ls-files", "--others", "--exclude-standard", "-z"], indexFile),
    ]);
    const changes = buildReviewChanges(nameStatus, numstat);
    const diff = createDiffAccumulator();
    diff.append(trackedDiff);
    for (const path of parseNullList(untrackedText)) {
      const patch = await diffUntrackedFile(cwd, path);
      diff.append(patch);
      changes.push(untrackedPatchChange(path, patch));
    }
    changes.sort((left, right) => left.path.localeCompare(right.path));
    return {
      repositoryRoot: cwd,
      requestedTarget: { kind: "current-state", ...(paths ? { paths } : {}) },
      target: { kind: "current-state", headCommit: head },
      title: "Current state audit",
      changes,
      ...diff.finish(changes.length),
    };
  });
}

async function comparisonSnapshot(
  cwd: string,
  requested: Extract<ReviewTargetSpec, { kind: "comparison" }>,
): Promise<ReviewSnapshot | undefined> {
  const [base, head] = await Promise.all([
    resolveCommit(cwd, requested.baseCommit),
    headCommit(cwd),
  ]);
  if (!base) {
    throw new Error(`Commit ${requested.baseCommit.slice(0, 7)} not found in this repository.`);
  }
  if (!head) throw new Error("No HEAD commit found in this repository.");
  const mergeBase = (await gitAllowExit(cwd, ["merge-base", base, head], [1])).trim();
  if (!mergeBase) {
    throw new Error(`No common ancestor between ${base.slice(0, 7)} and ${head.slice(0, 7)}.`);
  }
  const [diffText, nameStatus, numstat] = await Promise.all([
    git(cwd, ["diff", ...DIFF_FLAGS, mergeBase, head]),
    git(cwd, ["diff", ...DIFF_FLAGS, "--name-status", "-z", mergeBase, head]),
    git(cwd, ["diff", ...DIFF_FLAGS, "--numstat", "-z", mergeBase, head]),
  ]);
  const changes = buildReviewChanges(nameStatus, numstat);
  if (changes.length === 0) return undefined;
  const diff = createDiffAccumulator();
  diff.append(diffText);
  return {
    repositoryRoot: cwd,
    requestedTarget: requested,
    target: {
      kind: "comparison",
      requestedBaseCommit: base,
      mergeBaseCommit: mergeBase,
      headCommit: head,
    },
    title: `Changes ${mergeBase.slice(0, 7)}..${head.slice(0, 7)}`,
    changes,
    ...diff.finish(changes.length),
  };
}

async function commitSnapshot(
  cwd: string,
  requested: Extract<ReviewTargetSpec, { kind: "commit" }>,
): Promise<ReviewSnapshot | undefined> {
  const commit = await resolveCommit(cwd, requested.commit);
  if (!commit) {
    throw new Error(`Commit ${requested.commit.slice(0, 7)} not found in this repository.`);
  }
  const parent = await commitParent(cwd, commit);
  const baseArgs = ["diff-tree", ...DIFF_FLAGS, "--root", "--no-commit-id"];
  const [diffText, nameStatus, numstat] = await Promise.all([
    parent
      ? git(cwd, ["diff", ...DIFF_FLAGS, parent, commit])
      : git(cwd, ["show", ...DIFF_FLAGS, "--format=", "--root", commit]),
    parent
      ? git(cwd, ["diff", ...DIFF_FLAGS, "--name-status", "-z", parent, commit])
      : git(cwd, [...baseArgs, "--name-status", "-r", "-z", commit]),
    parent
      ? git(cwd, ["diff", ...DIFF_FLAGS, "--numstat", "-z", parent, commit])
      : git(cwd, [...baseArgs, "--numstat", "-r", "-z", commit]),
  ]);
  const changes = buildReviewChanges(nameStatus, numstat);
  if (changes.length === 0) return undefined;
  const diff = createDiffAccumulator();
  diff.append(diffText);
  return {
    repositoryRoot: cwd,
    requestedTarget: requested,
    target: { kind: "commit", commit, ...(parent ? { parentCommit: parent } : {}) },
    title: `Commit ${commit.slice(0, 7)}`,
    changes,
    ...diff.finish(changes.length),
  };
}

/** Pin target identities and capture the target's changed paths, patch hash, and stats. */
export async function resolveReviewSnapshot(
  cwd: string,
  target: ReviewTargetSpec,
): Promise<ReviewSnapshot | undefined> {
  const root = await resolveGitRepositoryRoot(cwd);
  switch (target.kind) {
    case "working-tree":
      return workingTreeSnapshot(root, target);
    case "comparison":
      return comparisonSnapshot(root, target);
    case "commit":
      return commitSnapshot(root, target);
    case "current-state":
      return currentStateSnapshot(root, target);
  }
}

/** Return the public, patch-free snapshot summary. */
export function summarizeReviewSnapshot(snapshot: ReviewSnapshot): ReviewSnapshotSummary {
  const { repositoryRoot: _, ...summary } = snapshot;
  return { ...summary, changes: snapshot.changes.map((change) => ({ ...change })) };
}
