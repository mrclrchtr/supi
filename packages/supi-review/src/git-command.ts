import { execFile } from "node:child_process";
import { lstatSync } from "node:fs";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 30_000;

function gitOptions(cwd: string, indexFile?: string) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("GIT_")) delete env[key];
  if (indexFile) env.GIT_INDEX_FILE = indexFile;
  return { cwd, env, timeout: GIT_TIMEOUT_MS, maxBuffer: 50 * 1024 * 1024 };
}

/** Run Git with bounded resources and a sanitized environment. */
export async function runGit(cwd: string, args: string[], indexFile?: string): Promise<string> {
  return (await execFileAsync("git", args, gitOptions(cwd, indexFile))).stdout;
}

/** Resolve the canonical top-level worktree containing an invocation directory. */
export async function resolveGitRepositoryRoot(cwd: string): Promise<string> {
  const root = (await runGit(cwd, ["rev-parse", "--show-toplevel"])).trim();
  if (!root) throw new Error(`No Git worktree contains ${cwd}.`);
  return realpath(root);
}

export function expectedGitExitOutput(error: unknown, allowedCodes: number[]): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const failure = error as {
    code?: unknown;
    killed?: unknown;
    signal?: unknown;
    stdout?: unknown;
  };
  if (
    typeof failure.code !== "number" ||
    !allowedCodes.includes(failure.code) ||
    failure.killed === true ||
    failure.signal
  ) {
    return undefined;
  }
  if (typeof failure.stdout === "string") return failure.stdout;
  if (Buffer.isBuffer(failure.stdout)) return failure.stdout.toString("utf8");
  return "";
}

/** Allow only documented non-zero Git outcomes while preserving operational failures. */
export async function runGitAllowExit(
  cwd: string,
  args: string[],
  allowedCodes: number[],
  indexFile?: string,
): Promise<string> {
  try {
    return await runGit(cwd, args, indexFile);
  } catch (error) {
    const stdout = expectedGitExitOutput(error, allowedCodes);
    if (stdout !== undefined) return stdout;
    throw error;
  }
}

/** Execute an operation against a temporary index seeded only from HEAD. */
export async function withHeadIndex<T>(
  cwd: string,
  head: string,
  operation: (indexFile: string) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "supi-review-index-"));
  const indexFile = join(directory, "index");
  try {
    await runGit(cwd, ["read-tree", head], indexFile);
    return await operation(indexFile);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

interface TreeIndexEntry {
  mode: string;
  objectId: string;
  path: string;
}

function parseTreeIndexEntries(text: string): TreeIndexEntry[] {
  return text.split("\0").flatMap((entry) => {
    if (!entry) return [];
    const tab = entry.indexOf("\t");
    if (tab < 0) return [];
    const [mode, _type, objectId] = entry.slice(0, tab).split(" ");
    const path = entry.slice(tab + 1);
    return mode && objectId && path ? [{ mode, objectId, path }] : [];
  });
}

function filesystemMatchesEntry(cwd: string, entry: TreeIndexEntry): boolean {
  try {
    const stat = lstatSync(resolve(cwd, entry.path));
    if (entry.mode === "120000") return stat.isSymbolicLink();
    if (entry.mode === "160000") return stat.isDirectory();
    return stat.isFile();
  } catch {
    return false;
  }
}

function pathOrder(left: TreeIndexEntry, right: TreeIndexEntry): number {
  return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
}

function descendantEntries(path: string, sortedEntries: TreeIndexEntry[]): TreeIndexEntry[] {
  const prefix = `${path}/`;
  let low = 0;
  let high = sortedEntries.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((sortedEntries[middle]?.path ?? "") < prefix) low = middle + 1;
    else high = middle;
  }
  const descendants: TreeIndexEntry[] = [];
  for (let index = low; index < sortedEntries.length; index++) {
    const candidate = sortedEntries[index];
    if (!candidate?.path.startsWith(prefix)) break;
    descendants.push(candidate);
  }
  return descendants;
}

function findPathConflicts(
  entry: TreeIndexEntry,
  sortedHeadEntries: TreeIndexEntry[],
  headByPath: Map<string, TreeIndexEntry>,
): TreeIndexEntry[] {
  let separator = entry.path.lastIndexOf("/");
  while (separator > 0) {
    const ancestor = headByPath.get(entry.path.slice(0, separator));
    if (ancestor) return [ancestor];
    separator = entry.path.lastIndexOf("/", separator - 1);
  }
  return descendantEntries(entry.path, sortedHeadEntries);
}

const GIT_ARG_CHUNK_CHARACTERS = 64 * 1024;

function chunkByArgumentSize<T>(values: T[], sizeOf: (value: T) => number): T[][] {
  const chunks: T[][] = [];
  let chunk: T[] = [];
  let size = 0;
  for (const value of values) {
    const valueSize = sizeOf(value);
    if (chunk.length > 0 && size + valueSize > GIT_ARG_CHUNK_CHARACTERS) {
      chunks.push(chunk);
      chunk = [];
      size = 0;
    }
    chunk.push(value);
    size += valueSize;
  }
  if (chunk.length > 0) chunks.push(chunk);
  return chunks;
}

async function removeIndexEntries(cwd: string, indexFile: string, paths: string[]): Promise<void> {
  for (const chunk of chunkByArgumentSize(paths, (path) => path.length + 1)) {
    await runGit(cwd, ["update-index", "--force-remove", "--", ...chunk], indexFile);
  }
}

async function addIndexEntries(
  cwd: string,
  indexFile: string,
  entries: TreeIndexEntry[],
): Promise<void> {
  for (const chunk of chunkByArgumentSize(
    entries,
    (entry) => entry.mode.length + entry.objectId.length + entry.path.length + 16,
  )) {
    const args = ["update-index", "--add"];
    for (const entry of chunk) {
      args.push("--cacheinfo", entry.mode, entry.objectId, entry.path);
    }
    await runGit(cwd, args, indexFile);
  }
}

async function addBaselineOnlyEntries(
  cwd: string,
  indexFile: string,
  baseline: string,
  head: string,
): Promise<void> {
  const [baselineTree, headTree] = await Promise.all([
    runGit(cwd, ["ls-tree", "-r", "-z", baseline]),
    runGit(cwd, ["ls-tree", "-r", "-z", head]),
  ]);
  const headEntries = parseTreeIndexEntries(headTree).sort(pathOrder);
  const headByPath = new Map(headEntries.map((entry) => [entry.path, entry]));
  const headPaths = new Set(headByPath.keys());
  const baselineOnly = parseTreeIndexEntries(baselineTree).filter(
    (entry) => !headPaths.has(entry.path),
  );
  const additions: TreeIndexEntry[] = [];
  const removals = new Set<string>();

  for (const entry of baselineOnly) {
    const conflicts = findPathConflicts(entry, headEntries, headByPath);
    if (conflicts.length === 0) {
      additions.push(entry);
      continue;
    }
    const currentUsesBaselineShape = filesystemMatchesEntry(cwd, entry);
    const currentUsesHeadShape = conflicts.some((candidate) =>
      filesystemMatchesEntry(cwd, candidate),
    );
    if (!currentUsesBaselineShape && currentUsesHeadShape) continue;
    for (const conflict of conflicts) removals.add(conflict.path);
    additions.push(entry);
  }

  await removeIndexEntries(cwd, indexFile, Array.from(removals));
  await addIndexEntries(cwd, indexFile, additions);
}

/**
 * Execute against a temporary union index containing paths tracked by either
 * captured HEAD or the selected baseline. This lets Git compare the baseline
 * directly with the current filesystem after branch-level deletions/renames.
 */
export async function withReviewIndex<T>(
  cwd: string,
  head: string,
  baseline: string,
  operation: (indexFile: string) => Promise<T>,
): Promise<T> {
  return withHeadIndex(cwd, head, async (indexFile) => {
    if (baseline !== head) await addBaselineOnlyEntries(cwd, indexFile, baseline, head);
    return operation(indexFile);
  });
}

/** Disable Git pathspec magic for a path-taking command. */
export function literalPathspec(args: string[]): string[] {
  return ["--literal-pathspecs", ...args];
}
