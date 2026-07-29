import { runGit as git, literalPathspec, withReviewIndex } from "./git-command.ts";
import { resolveReviewPath } from "./review-path.ts";
import {
  assertFullDiffCharacters,
  DIFF_FLAGS,
  diffUntrackedFile,
  joinDiffParts,
  parseNullList,
} from "./target/diff.ts";
import type { ResolvedReviewTarget, ReviewSnapshot } from "./types.ts";

export { resolveReviewSnapshot, summarizeReviewSnapshot } from "./target/resolve.ts";

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
