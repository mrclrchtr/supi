import {
  expectedGitExitOutput as expectedExitOutput,
  runGit as git,
  runGitAllowExit as gitAllowExit,
  literalPathspec,
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

const FULL_COMMIT_ID_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;
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

/** Validate the agent-facing full Git object-id syntax before invoking Git. */
export function isFullCommitId(value: string): boolean {
  return FULL_COMMIT_ID_RE.test(value);
}

async function resolveCommit(cwd: string, value: string): Promise<string | undefined> {
  if (!isFullCommitId(value)) return undefined;
  const type = (await gitAllowExit(cwd, ["cat-file", "-t", value], [128])).trim();
  if (type !== "commit") return undefined;
  const canonical = (await git(cwd, ["rev-parse", "--verify", value])).trim().toLowerCase();
  return canonical === value.toLowerCase() ? canonical : undefined;
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

function joinDiffs(parts: string[]): string {
  return parts
    .filter(Boolean)
    .map((part) => (part.endsWith("\n") ? part : `${part}\n`))
    .join("");
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
    const [trackedDiff, tracked, untrackedText] = await Promise.all([
      git(cwd, ["diff", ...DIFF_FLAGS, "HEAD"], indexFile),
      git(cwd, ["diff", "--name-only", "-z", "HEAD"], indexFile),
      git(cwd, ["ls-files", "--others", "--exclude-standard", "-z"], indexFile),
    ]);
    const untracked = parseNullList(untrackedText);
    const changedFiles = Array.from(new Set([...parseNullList(tracked), ...untracked])).sort();
    if (changedFiles.length === 0) return undefined;
    const diffText = joinDiffs([
      trackedDiff,
      ...(await Promise.all(untracked.map((path) => diffUntrackedFile(cwd, path)))),
    ]);
    return {
      requestedTarget: { kind: "working-tree" },
      target: { kind: "working-tree", headCommit: head },
      title: "Working tree changes",
      changedFiles,
      diffText,
      stats: parseDiffStats(diffText, changedFiles.length),
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
  if (!base || !head) return undefined;
  const mergeBase = (await gitAllowExit(cwd, ["merge-base", base, head], [1])).trim();
  if (!mergeBase) return undefined;
  const [diffText, names] = await Promise.all([
    git(cwd, ["diff", ...DIFF_FLAGS, mergeBase, head]),
    git(cwd, ["diff", "--name-only", "-z", mergeBase, head]),
  ]);
  const changedFiles = parseNullList(names);
  if (changedFiles.length === 0) return undefined;
  return {
    requestedTarget: requested,
    target: {
      kind: "comparison",
      requestedBaseCommit: base,
      mergeBaseCommit: mergeBase,
      headCommit: head,
    },
    title: `Changes ${mergeBase.slice(0, 7)}..${head.slice(0, 7)}`,
    changedFiles,
    diffText,
    stats: parseDiffStats(diffText, changedFiles.length),
  };
}

async function commitSnapshot(
  cwd: string,
  requested: Extract<ReviewTargetSpec, { kind: "commit" }>,
): Promise<ReviewSnapshot | undefined> {
  const commit = await resolveCommit(cwd, requested.commit);
  if (!commit) return undefined;
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
  return {
    requestedTarget: requested,
    target: { kind: "commit", commit, ...(parent ? { parentCommit: parent } : {}) },
    title: `Commit ${commit.slice(0, 7)}`,
    changedFiles,
    diffText,
    stats: parseDiffStats(diffText, changedFiles.length),
  };
}

export interface CommitChoice {
  commit: string;
  label: string;
}

/** List local branches with resolved commit ids for the interactive adapter. */
export async function listLocalBranches(cwd: string): Promise<CommitChoice[]> {
  const output = await git(cwd, [
    "for-each-ref",
    // biome-ignore lint/security/noSecrets: Git format syntax, not a secret
    "--format=%(objectname)%00%(refname:short)",
    "refs/heads",
  ]);
  return output
    .trim()
    .split("\n")
    .flatMap((line) => {
      const [commit, label] = line.split("\0");
      return commit && label ? [{ commit, label }] : [];
    });
}

/** List recent commits with resolved ids for the interactive adapter. */
export async function listRecentCommits(cwd: string, limit = 30): Promise<CommitChoice[]> {
  const output = await git(cwd, [
    "log",
    `--max-count=${limit}`,
    // biome-ignore lint/security/noSecrets: Git format syntax, not a secret
    "--format=%H%x00%s",
  ]);
  return output
    .trim()
    .split("\n")
    .flatMap((line) => {
      const [commit, subject] = line.split("\0");
      return commit && subject ? [{ commit, label: `${commit.slice(0, 7)}  ${subject}` }] : [];
    });
}

/** Pin target identities and capture the target's changed files, patch, and stats. */
export function resolveReviewSnapshot(
  cwd: string,
  target: ReviewTargetSpec,
): Promise<ReviewSnapshot | undefined> {
  switch (target.kind) {
    case "working-tree":
      return workingTreeSnapshot(cwd);
    case "comparison":
      return comparisonSnapshot(cwd, target);
    case "commit":
      return commitSnapshot(cwd, target);
  }
}

/** Remove the potentially large patch while retaining pinned target metadata. */
export function summarizeReviewSnapshot(snapshot: ReviewSnapshot): ReviewSnapshotSummary {
  const { diffText: _, ...summary } = snapshot;
  return summary;
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
  cwd: string,
  snapshot: ReviewSnapshot,
  path: string,
  side: "before" | "after" = "after",
): Promise<string | undefined> {
  const safe = resolveReviewPath(cwd, path);
  const target = snapshot.target;
  if (target.kind === "working-tree") {
    if (side === "before") return showBlob(cwd, target.headCommit, safe.path);
    if (!(await isWorkingTreePathAllowed(cwd, target.headCommit, safe.path))) {
      throw new Error(`${safe.path} is not part of the selected working-tree target.`);
    }
    return readWorkingTreeFile(cwd, safe.path);
  }
  if (target.kind === "comparison") {
    return showBlob(cwd, side === "before" ? target.mergeBaseCommit : target.headCommit, safe.path);
  }
  return showBlob(cwd, side === "before" ? target.parentCommit : target.commit, safe.path);
}

/** Read one changed file's patch from the selected target. */
export async function readReviewDiff(
  cwd: string,
  snapshot: ReviewSnapshot,
  path: string,
): Promise<string> {
  const safe = resolveReviewPath(cwd, path);
  if (!snapshot.changedFiles.includes(safe.path)) {
    throw new Error(`${safe.path} is not changed by this target.`);
  }
  const target = snapshot.target;
  if (target.kind === "working-tree") {
    return withHeadIndex(cwd, target.headCommit, async (indexFile) => {
      const tracked = await git(
        cwd,
        literalPathspec(["diff", ...DIFF_FLAGS, "HEAD", "--", safe.path]),
        indexFile,
      );
      return tracked || diffUntrackedFile(cwd, safe.path);
    });
  }
  if (target.kind === "comparison") {
    return git(
      cwd,
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
        cwd,
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
        cwd,
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
export async function listReviewFiles(cwd: string, snapshot: ReviewSnapshot): Promise<string[]> {
  const target = snapshot.target;
  if (target.kind !== "working-tree") {
    const commit = target.kind === "comparison" ? target.headCommit : target.commit;
    return parseNullList(await git(cwd, ["ls-tree", "-r", "--name-only", "-z", commit]));
  }
  return withHeadIndex(cwd, target.headCommit, async (indexFile) => {
    const candidates = parseNullList(
      await git(cwd, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], indexFile),
    );
    return filterExistingReviewPaths(cwd, candidates);
  });
}

/** Search literal text on the target's after side with Git's repository-aware search. */
export async function searchReviewFiles(
  cwd: string,
  snapshot: ReviewSnapshot,
  query: string,
  path?: string,
): Promise<string> {
  const pathArgs = path ? ["--", resolveReviewPath(cwd, path).path] : [];
  const target = snapshot.target;
  const args = literalPathspec(["grep", "-n", "-F", "--untracked", "-e", query, ...pathArgs]);
  if (target.kind === "working-tree") {
    return withHeadIndex(cwd, target.headCommit, (indexFile) =>
      gitAllowExit(cwd, args, [1], indexFile),
    );
  }
  const commit = target.kind === "comparison" ? target.headCommit : target.commit;
  return gitAllowExit(
    cwd,
    literalPathspec(["grep", "-n", "-F", "-e", query, commit, ...pathArgs]),
    [1],
  );
}
