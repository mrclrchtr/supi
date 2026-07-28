import { createHash } from "node:crypto";
import {
  expectedGitExitOutput as expectedExitOutput,
  runGit as git,
  runGitAllowExit as gitAllowExit,
  literalPathspec,
  resolveGitRepositoryRoot,
  withHeadIndex,
} from "./git-command.ts";
import {
  filterExistingReviewPaths,
  readWorkingTreeFile,
  resolveReviewPath,
} from "./review-path.ts";
import type {
  DiffStats,
  ReviewSnapshot,
  ReviewSnapshotSummary,
  ReviewTargetSpec,
} from "./types.ts";

const DIFF_FLAGS = ["--no-ext-diff", "--no-textconv", "--binary"] as const;

function parseNullList(text: string): string[] {
  return text
    .split("\0")
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

/** Count patch additions and deletions without interpreting binary payloads. */
export function parseDiffStats(text: string, fileCount?: number): DiffStats {
  let additions = 0;
  let deletions = 0;
  let files = 0;
  for (const line of text.split("\n")) {
    if (line.startsWith("diff --git ")) files++;
    else if (line.startsWith("+") && !line.startsWith("+++")) additions++;
    else if (line.startsWith("-") && !line.startsWith("---")) deletions++;
  }
  return { files: fileCount ?? files, additions, deletions };
}

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

interface DiffAccumulator {
  append(diff: string): void;
  finish(fileCount: number): { diffHash: string; stats: DiffStats };
}

function createDiffAccumulator(): DiffAccumulator {
  const hash = createHash("sha256");
  let additions = 0;
  let deletions = 0;
  return {
    append(diff) {
      if (!diff) return;
      hash.update(diff, "utf8");
      if (!diff.endsWith("\n")) hash.update("\n", "utf8");
      const stats = parseDiffStats(diff);
      additions += stats.additions;
      deletions += stats.deletions;
    },
    finish(fileCount) {
      return {
        diffHash: hash.digest("hex"),
        stats: { files: fileCount, additions, deletions },
      };
    },
  };
}

async function diffUntrackedFile(cwd: string, path: string): Promise<string> {
  const safe = resolveReviewPath(cwd, path);
  return gitAllowExit(
    cwd,
    literalPathspec(["diff", ...DIFF_FLAGS, "--no-index", "--", "/dev/null", safe.path]),
    [1],
  );
}

async function workingTreeSnapshot(cwd: string): Promise<ReviewSnapshot | undefined> {
  const head = await headCommit(cwd);
  if (!head) return undefined;
  return withHeadIndex(cwd, head, async (indexFile) => {
    const [tracked, untrackedText] = await Promise.all([
      git(cwd, ["diff", "--name-only", "-z", "HEAD"], indexFile),
      git(cwd, ["ls-files", "--others", "--exclude-standard", "-z"], indexFile),
    ]);
    const untracked = parseNullList(untrackedText);
    const changedFiles = Array.from(new Set([...parseNullList(tracked), ...untracked])).sort();
    if (changedFiles.length === 0) return undefined;

    const diff = createDiffAccumulator();
    diff.append(await git(cwd, ["diff", ...DIFF_FLAGS, "HEAD"], indexFile));
    for (const path of untracked) diff.append(await diffUntrackedFile(cwd, path));
    const identity = diff.finish(changedFiles.length);
    return {
      repositoryRoot: cwd,
      requestedTarget: { kind: "working-tree" },
      target: { kind: "working-tree", headCommit: head },
      title: "Working tree changes",
      changedFiles,
      ...identity,
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
  if (!head) {
    throw new Error("No HEAD commit found in this repository.");
  }
  const mergeBase = (await gitAllowExit(cwd, ["merge-base", base, head], [1])).trim();
  if (!mergeBase) {
    throw new Error(`No common ancestor between ${base.slice(0, 7)} and ${head.slice(0, 7)}.`);
  }
  const [diffText, names] = await Promise.all([
    git(cwd, ["diff", ...DIFF_FLAGS, mergeBase, head]),
    git(cwd, ["diff", "--name-only", "-z", mergeBase, head]),
  ]);
  const changedFiles = parseNullList(names);
  if (changedFiles.length === 0) return undefined;
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
    changedFiles,
    ...diff.finish(changedFiles.length),
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
  const [diffText, names] = await Promise.all([
    parent
      ? git(cwd, ["diff", ...DIFF_FLAGS, parent, commit])
      : git(cwd, ["show", ...DIFF_FLAGS, "--format=", "--root", commit]),
    parent
      ? git(cwd, ["diff", "--name-only", "-z", parent, commit])
      : git(cwd, ["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", "-z", commit]),
  ]);
  const changedFiles = parseNullList(names);
  if (changedFiles.length === 0) return undefined;
  const diff = createDiffAccumulator();
  diff.append(diffText);
  return {
    repositoryRoot: cwd,
    requestedTarget: requested,
    target: { kind: "commit", commit, ...(parent ? { parentCommit: parent } : {}) },
    title: `Commit ${commit.slice(0, 7)}`,
    changedFiles,
    ...diff.finish(changedFiles.length),
  };
}

/** Pin target identities and capture the target's changed files, patch, and stats. */
export async function resolveReviewSnapshot(
  cwd: string,
  target: ReviewTargetSpec,
): Promise<ReviewSnapshot | undefined> {
  const root = await resolveGitRepositoryRoot(cwd);
  switch (target.kind) {
    case "working-tree":
      return workingTreeSnapshot(root);
    case "comparison":
      return comparisonSnapshot(root, target);
    case "commit":
      return commitSnapshot(root, target);
  }
}

/** Return the public, patch-free snapshot summary. */
export function summarizeReviewSnapshot(snapshot: ReviewSnapshot): ReviewSnapshotSummary {
  const { repositoryRoot: _, ...summary } = snapshot;
  return { ...summary, changedFiles: [...snapshot.changedFiles] };
}

async function showBlob(
  cwd: string,
  commit: string | undefined,
  path: string,
): Promise<string | undefined> {
  if (!commit) return undefined;
  try {
    return await git(cwd, ["show", `${commit}:${path}`]);
  } catch (error) {
    if (expectedExitOutput(error, [128]) !== undefined) return undefined;
    throw error;
  }
}

async function isWorkingTreePathAllowed(cwd: string, head: string, path: string): Promise<boolean> {
  return withHeadIndex(cwd, head, async (indexFile) => {
    const output = await git(
      cwd,
      literalPathspec(["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", path]),
      indexFile,
    );
    return parseNullList(output).includes(path);
  });
}

/** Read one before/after file from the target rather than an unrelated live checkout. */
export async function readReviewFile(
  _cwd: string,
  snapshot: ReviewSnapshot,
  path: string,
  side: "before" | "after" = "after",
): Promise<string | undefined> {
  const root = snapshot.repositoryRoot;
  const safe = resolveReviewPath(root, path);
  const target = snapshot.target;
  if (target.kind === "working-tree") {
    if (side === "before") return showBlob(root, target.headCommit, safe.path);
    if (!(await isWorkingTreePathAllowed(root, target.headCommit, safe.path))) {
      throw new Error(`${safe.path} is not part of the selected working-tree target.`);
    }
    return readWorkingTreeFile(root, safe.path);
  }
  if (target.kind === "comparison") {
    return showBlob(
      root,
      side === "before" ? target.mergeBaseCommit : target.headCommit,
      safe.path,
    );
  }
  return showBlob(root, side === "before" ? target.parentCommit : target.commit, safe.path);
}

/** Read one changed file's patch from the selected target. */
export async function readReviewDiff(
  _cwd: string,
  snapshot: ReviewSnapshot,
  path: string,
): Promise<string> {
  const root = snapshot.repositoryRoot;
  const safe = resolveReviewPath(root, path);
  if (!snapshot.changedFiles.includes(safe.path)) {
    throw new Error(`${safe.path} is not changed by this target.`);
  }
  const target = snapshot.target;
  if (target.kind === "working-tree") {
    return withHeadIndex(root, target.headCommit, async (indexFile) => {
      const tracked = await git(
        root,
        literalPathspec(["diff", ...DIFF_FLAGS, "HEAD", "--", safe.path]),
        indexFile,
      );
      return tracked || diffUntrackedFile(root, safe.path);
    });
  }
  if (target.kind === "comparison") {
    return git(
      root,
      literalPathspec([
        "diff",
        ...DIFF_FLAGS,
        target.mergeBaseCommit,
        target.headCommit,
        "--",
        safe.path,
      ]),
    );
  }
  return target.parentCommit
    ? git(
        root,
        literalPathspec([
          "diff",
          ...DIFF_FLAGS,
          target.parentCommit,
          target.commit,
          "--",
          safe.path,
        ]),
      )
    : git(
        root,
        literalPathspec([
          "show",
          ...DIFF_FLAGS,
          "--format=",
          "--root",
          target.commit,
          "--",
          safe.path,
        ]),
      );
}

/** List files present on the target's after side, excluding ignored untracked files. */
export async function listReviewFiles(_cwd: string, snapshot: ReviewSnapshot): Promise<string[]> {
  const root = snapshot.repositoryRoot;
  const target = snapshot.target;
  if (target.kind !== "working-tree") {
    const commit = target.kind === "comparison" ? target.headCommit : target.commit;
    return parseNullList(await git(root, ["ls-tree", "-r", "--name-only", "-z", commit]));
  }
  return withHeadIndex(root, target.headCommit, async (indexFile) => {
    const candidates = parseNullList(
      await git(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], indexFile),
    );
    return filterExistingReviewPaths(root, candidates);
  });
}

/** Search literal text on the target's after side with Git's repository-aware search. */
export async function searchReviewFiles(
  _cwd: string,
  snapshot: ReviewSnapshot,
  query: string,
  path?: string,
): Promise<string> {
  const root = snapshot.repositoryRoot;
  const pathArgs = path ? ["--", resolveReviewPath(root, path).path] : [];
  const target = snapshot.target;
  const args = literalPathspec(["grep", "-n", "-F", "--untracked", "-e", query, ...pathArgs]);
  if (target.kind === "working-tree") {
    return withHeadIndex(root, target.headCommit, (indexFile) =>
      gitAllowExit(root, args, [1], indexFile),
    );
  }
  const commit = target.kind === "comparison" ? target.headCommit : target.commit;
  return gitAllowExit(
    root,
    literalPathspec(["grep", "-n", "-F", "-e", query, commit, ...pathArgs]),
    [1],
  );
}
