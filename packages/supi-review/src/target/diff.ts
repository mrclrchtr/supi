import { runGitAllowExit as gitAllowExit, literalPathspec } from "../git-command.ts";
import { resolveReviewPath } from "../review-path.ts";

/** Maximum aggregate full-diff text materialized by one reviewer tool call. */
export const MAX_FULL_DIFF_CHARACTERS = 50 * 1024 * 1024;

/** Reject aggregate full-diff materialization above the process-safe tool bound. */
export function assertFullDiffCharacters(totalCharacters: number): void {
  if (totalCharacters > MAX_FULL_DIFF_CHARACTERS) {
    throw new Error(
      `Full target diff exceeds ${MAX_FULL_DIFF_CHARACTERS} characters; read changed paths individually.`,
    );
  }
}

/** Stable patch flags that disable external transformations and retain binary evidence. */
export const DIFF_FLAGS = ["--no-ext-diff", "--no-textconv", "--binary"] as const;

/** Parse and deterministically sort a NUL-delimited Git path list. */
export function parseNullList(text: string): string[] {
  return text
    .split("\0")
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

/** Render one untracked path as a deterministic `/dev/null`-to-file patch. */
export async function diffUntrackedFile(cwd: string, path: string): Promise<string> {
  const safe = resolveReviewPath(cwd, path);
  return gitAllowExit(
    cwd,
    literalPathspec(["diff", ...DIFF_FLAGS, "--no-index", "--", "/dev/null", safe.path]),
    [1],
  );
}

/** Join canonical patch parts with exactly one required trailing newline per non-empty part. */
export function joinDiffParts(parts: string[]): string {
  const populated = parts.filter(Boolean);
  const totalCharacters = populated.reduce((total, part) => total + part.length + 1, 0);
  assertFullDiffCharacters(totalCharacters);
  return populated.map((part) => (part.endsWith("\n") ? part : `${part}\n`)).join("");
}
