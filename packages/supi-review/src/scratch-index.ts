import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runGit, type ScratchIndex } from "./git-command.ts";

/**
 * Execute an operation against an empty scratch index. Object writes, such as the empty blob
 * `git add --intent-to-add` records, go to a private object directory that reads through to the
 * repository's objects and is removed afterwards.
 */
export async function withScratchIndex<T>(
  cwd: string,
  operation: (index: ScratchIndex) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const repositoryObjects = resolve(
    cwd,
    (await runGit(cwd, ["rev-parse", "--git-path", "objects"], undefined, signal)).trim(),
  );
  const directory = await mkdtemp(join(tmpdir(), "supi-review-scratch-"));
  const objects = join(directory, "objects");
  const index: ScratchIndex = {
    env: {
      GIT_INDEX_FILE: join(directory, "index"),
      GIT_OBJECT_DIRECTORY: objects,
      GIT_ALTERNATE_OBJECT_DIRECTORIES: repositoryObjects,
    },
  };
  try {
    await mkdir(objects);
    await runGit(cwd, ["read-tree", "--empty"], index, signal);
    return await operation(index);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
