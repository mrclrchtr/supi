import {
  runGitBuffer as gitBuffer,
  runGitWithInput as gitWithInput,
  literalPathspec,
  type ScratchIndex,
} from "../git-command.ts";
import { resolveReviewPath } from "../review-path.ts";
import { withScratchIndex } from "../scratch-index.ts";

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

/** Split a multi-file patch at its `diff --git` headers. Content lines always carry a prefix. */
function splitPatchFiles(patch: Buffer): Buffer[] {
  const header = Buffer.from("diff --git ");
  const starts: number[] = [];
  for (let index = patch.indexOf(header); index >= 0; index = patch.indexOf(header, index + 1)) {
    if (index === 0 || patch[index - 1] === 0x0a) starts.push(index);
  }
  return starts.map((start, position) => patch.subarray(start, starts[position + 1]));
}

/**
 * Render untracked paths as exact `/dev/null`-to-file patches with one `git diff`.
 *
 * The paths are recorded with `--intent-to-add` in an empty scratch index, so the diff shows each
 * as a new file. Its bytes equal a per-file `git diff --no-index /dev/null <path>`. Nested
 * repositories (listed with a trailing `/`) get an empty patch, as that per-file diff produced.
 * The returned map keeps the caller's path order, which `diffHash` depends on; Git's own output
 * order differs.
 */
export async function diffUntrackedFiles(
  cwd: string,
  paths: string[],
  signal?: AbortSignal,
): Promise<Map<string, Buffer>> {
  const files = paths.filter((path) => !path.endsWith("/"));
  for (const path of files) resolveReviewPath(cwd, path);
  const byPath = new Map<string, Buffer>();
  if (files.length > 0) {
    await withScratchIndex(
      cwd,
      async (index) => {
        await gitWithInput(
          cwd,
          literalPathspec([
            // `--no-index` takes the mode from lstat; keep the executable bit like it did.
            "-c",
            "core.fileMode=true",
            "add",
            "--intent-to-add",
            "--sparse",
            "--pathspec-from-file=-",
            "--pathspec-file-nul",
          ]),
          files.map((path) => `${path}\0`).join(""),
          { indexFile: index, signal },
        );
        const [names, patch] = await Promise.all([
          gitBuffer(cwd, ["diff", "--no-color", ...DIFF_FLAGS, "--name-only", "-z"], index, signal),
          readBoundedDiff(cwd, index, signal),
        ]);
        const order = names.toString("utf8").split("\0").filter(Boolean);
        const parts = splitPatchFiles(patch);
        if (order.length !== parts.length || order.length !== files.length) {
          throw new Error(
            `Untracked diff covered ${parts.length} of ${files.length} files; inspect the working tree with git status.`,
          );
        }
        for (const [position, path] of order.entries()) {
          byPath.set(path, parts[position] ?? Buffer.alloc(0));
        }
        const missing = files.find((path) => !byPath.has(path));
        if (missing !== undefined) {
          throw new Error(`Untracked diff did not cover ${missing}; inspect it with git status.`);
        }
      },
      signal,
    );
  }
  return new Map(paths.map((path) => [path, byPath.get(path) ?? Buffer.alloc(0)]));
}

async function readBoundedDiff(
  cwd: string,
  index: ScratchIndex,
  signal?: AbortSignal,
): Promise<Buffer> {
  try {
    // Header splitting needs plain output, whatever `color.ui` says.
    return await gitBuffer(cwd, ["diff", "--no-color", ...DIFF_FLAGS], index, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
      assertFullDiffBytes(MAX_FULL_DIFF_BYTES + 1);
    }
    throw error;
  }
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
