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

export { isRootCommit, resolveReviewSnapshot, summarizeReviewSnapshot } from "./target/resolve.ts";

function withFilesystemIndex<T>(
  cwd: string,
  target: ResolvedReviewTarget,
  operation: (indexFile: string) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  return withReviewIndex(cwd, target.toCommit, target.fromCommit ?? target.toCommit, {
    operation,
    signal,
  });
}

async function readFilesystemDiff(
  root: string,
  target: ResolvedReviewTarget,
  path?: string,
  signal?: AbortSignal,
): Promise<string> {
  const baseline = target.fromCommit ?? target.toCommit;
  return withFilesystemIndex(
    root,
    target,
    async (indexFile) => {
      const pathArgs = path ? ["--", path] : [];
      const [tracked, untrackedText] = await Promise.all([
        git(
          root,
          literalPathspec(["diff", ...DIFF_FLAGS, baseline, ...pathArgs]),
          indexFile,
          signal,
        ),
        git(
          root,
          literalPathspec(["ls-files", "--others", "--exclude-standard", "-z", ...pathArgs]),
          indexFile,
          signal,
        ),
      ]);
      const parts = [tracked];
      let totalCharacters = tracked.length;
      for (const untrackedPath of parseNullList(untrackedText)) {
        signal?.throwIfAborted();
        const patch = await diffUntrackedFile(root, untrackedPath);
        totalCharacters += patch.length;
        assertFullDiffCharacters(totalCharacters);
        parts.push(patch);
      }
      return joinDiffParts(parts);
    },
    signal,
  );
}

/** Read the full canonical change patch, or one changed path patch. */
export async function readReviewDiff(
  _cwd: string,
  snapshot: ReviewSnapshot,
  path?: string,
  signal?: AbortSignal,
): Promise<string> {
  const root = snapshot.repositoryRoot;
  const safe = path ? resolveReviewPath(root, path) : undefined;
  if (safe && !snapshot.changes.some((change) => change.path === safe.path)) {
    throw new Error(`${safe.path} is not changed by this target.`);
  }
  const target = snapshot.target;
  if (target.includeUncommittedChanges) {
    return readFilesystemDiff(root, target, safe?.path, signal);
  }
  if (!target.fromCommit) return "";
  return git(
    root,
    literalPathspec([
      "diff",
      ...DIFF_FLAGS,
      target.fromCommit,
      target.toCommit,
      ...(safe ? ["--", safe.path] : []),
    ]),
    undefined,
    signal,
  );
}
