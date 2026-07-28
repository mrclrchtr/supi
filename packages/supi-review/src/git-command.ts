import { execFile } from "node:child_process";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

/** Disable Git pathspec magic for a path-taking command. */
export function literalPathspec(args: string[]): string[] {
  return ["--literal-pathspecs", ...args];
}
