import { runGitBufferAllowExit as gitBufferAllowExit, literalPathspec } from "../git-command.ts";
import { resolveReviewPath } from "../review-path.ts";

/** Maximum aggregate full-diff bytes materialized by one Review operation. */
export const MAX_FULL_DIFF_BYTES = 50 * 1024 * 1024;

/** Reject aggregate full-diff materialization above the process-safe byte bound. */
export function assertFullDiffBytes(totalBytes: number): void {
  if (totalBytes > MAX_FULL_DIFF_BYTES) {
    throw new Error(
      `Full target diff exceeds ${MAX_FULL_DIFF_BYTES} bytes; inspect changed paths individually.`,
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

/** Render one untracked path as an exact `/dev/null`-to-file patch. */
export async function diffUntrackedFile(cwd: string, path: string): Promise<Buffer> {
  const safe = resolveReviewPath(cwd, path);
  return gitBufferAllowExit(
    cwd,
    literalPathspec(["diff", ...DIFF_FLAGS, "--no-index", "--", "/dev/null", safe.path]),
    [1],
  );
}

/** Join canonical patch parts and add one required trailing newline to each part. */
export function joinDiffParts(parts: Buffer[]): Buffer {
  const populated = parts.filter((part) => part.length > 0);
  const normalized = populated.map((part) =>
    part.at(-1) === 0x0a ? part : Buffer.concat([part, Buffer.from("\n")]),
  );
  const totalBytes = normalized.reduce((total, part) => total + part.length, 0);
  assertFullDiffBytes(totalBytes);
  return Buffer.concat(normalized, totalBytes);
}
