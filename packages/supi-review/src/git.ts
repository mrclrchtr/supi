import {
  expectedGitExitOutput as expectedExitOutput,
  runGit as git,
  runGitAllowExit as gitAllowExit,
  literalPathspec,
  withReviewIndex,
} from "./git-command.ts";
import {
  filterExistingReviewPaths,
  readWorkingTreeFile,
  resolveReviewPath,
} from "./review-path.ts";
import {
  assertFullDiffCharacters,
  DIFF_FLAGS,
  diffUntrackedFile,
  joinDiffParts,
  parseNullList,
} from "./target/diff.ts";
import type { ResolvedReviewTarget, ReviewSnapshot } from "./types.ts";

export { resolveReviewSnapshot, summarizeReviewSnapshot } from "./target/resolve.ts";

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

function withWorkingTreeIndex<T>(
  cwd: string,
  target: Extract<ResolvedReviewTarget, { kind: "working-tree" }>,
  operation: (indexFile: string) => Promise<T>,
): Promise<T> {
  return withReviewIndex(
    cwd,
    target.headCommit,
    target.mergeBaseCommit ?? target.headCommit,
    operation,
  );
}

async function isWorkingTreePathAllowed(
  cwd: string,
  target: Extract<ResolvedReviewTarget, { kind: "working-tree" }>,
  path: string,
): Promise<boolean> {
  return withWorkingTreeIndex(cwd, target, async (indexFile) => {
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
    if (side === "before") {
      return showBlob(root, target.mergeBaseCommit ?? target.headCommit, safe.path);
    }
    if (!(await isWorkingTreePathAllowed(root, target, safe.path))) {
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

async function readWorkingTreeDiff(
  root: string,
  target: Extract<ResolvedReviewTarget, { kind: "working-tree" }>,
  path?: string,
): Promise<string> {
  return withWorkingTreeIndex(root, target, async (indexFile) => {
    const baseline = target.mergeBaseCommit ?? target.headCommit;
    const pathArgs = path ? ["--", path] : [];
    const [tracked, untrackedText] = await Promise.all([
      git(root, literalPathspec(["diff", ...DIFF_FLAGS, baseline, ...pathArgs]), indexFile),
      git(
        root,
        literalPathspec(["ls-files", "--others", "--exclude-standard", "-z", ...pathArgs]),
        indexFile,
      ),
    ]);
    const parts = [tracked];
    let totalCharacters = tracked.length;
    for (const untrackedPath of parseNullList(untrackedText)) {
      const patch = await diffUntrackedFile(root, untrackedPath);
      totalCharacters += patch.length;
      assertFullDiffCharacters(totalCharacters);
      parts.push(patch);
    }
    return joinDiffParts(parts);
  });
}

/** Read the full target patch, or one changed path's patch when `path` is supplied. */
export async function readReviewDiff(
  _cwd: string,
  snapshot: ReviewSnapshot,
  path?: string,
): Promise<string> {
  const root = snapshot.repositoryRoot;
  const safe = path ? resolveReviewPath(root, path) : undefined;
  if (safe && !snapshot.changes.some((change) => change.path === safe.path)) {
    throw new Error(`${safe.path} is not changed by this target.`);
  }
  const target = snapshot.target;
  if (target.kind === "working-tree") {
    return readWorkingTreeDiff(root, target, safe?.path);
  }
  const pathArgs = safe ? ["--", safe.path] : [];
  if (target.kind === "comparison") {
    return git(
      root,
      literalPathspec([
        "diff",
        ...DIFF_FLAGS,
        target.mergeBaseCommit,
        target.headCommit,
        ...pathArgs,
      ]),
    );
  }
  return target.parentCommit
    ? git(
        root,
        literalPathspec(["diff", ...DIFF_FLAGS, target.parentCommit, target.commit, ...pathArgs]),
      )
    : git(
        root,
        literalPathspec(["show", ...DIFF_FLAGS, "--format=", "--root", target.commit, ...pathArgs]),
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
  return withWorkingTreeIndex(root, target, async (indexFile) => {
    const candidates = parseNullList(
      await git(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], indexFile),
    );
    return filterExistingReviewPaths(root, candidates);
  });
}

/** Target side, Git search mode, and optional repository-relative scope. */
export interface ReviewSearchOptions {
  path?: string;
  side?: "before" | "after";
  mode?: "literal" | "regex";
}

function resolveSearchCommit(
  target: ResolvedReviewTarget,
  side: "before" | "after",
): string | undefined {
  if (target.kind === "working-tree") return target.mergeBaseCommit ?? target.headCommit;
  if (target.kind === "comparison") {
    return side === "before" ? target.mergeBaseCommit : target.headCommit;
  }
  return side === "before" ? target.parentCommit : target.commit;
}

/** Search literal or extended-regex text on either selected target side. */
export async function searchReviewFiles(
  _cwd: string,
  snapshot: ReviewSnapshot,
  query: string,
  options: ReviewSearchOptions = {},
): Promise<string> {
  const root = snapshot.repositoryRoot;
  const pathArgs = options.path ? ["--", resolveReviewPath(root, options.path).path] : [];
  const target = snapshot.target;
  const side = options.side ?? "after";
  const modeFlag = options.mode === "regex" ? "-E" : "-F";

  if (target.kind === "working-tree" && side === "after") {
    const args = literalPathspec(["grep", "-n", modeFlag, "--untracked", "-e", query, ...pathArgs]);
    return withWorkingTreeIndex(root, target, (indexFile) =>
      gitAllowExit(root, args, [1], indexFile),
    );
  }

  const commit = resolveSearchCommit(target, side);
  if (!commit) return "";
  return gitAllowExit(
    root,
    literalPathspec(["grep", "-n", modeFlag, "-e", query, commit, ...pathArgs]),
    [1],
  );
}
