import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expectedGitExitOutput, sanitizedGitEnv } from "@mrclrchtr/supi-core/git";

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 30_000;

function gitOptions(cwd: string, signal?: AbortSignal, timeoutMs = GIT_TIMEOUT_MS) {
  return {
    cwd,
    env: sanitizedGitEnv(),
    timeout: timeoutMs,
    maxBuffer: 50 * 1024 * 1024,
    ...(signal ? { signal } : {}),
  };
}

/**
 * Run Git with bounded resources and a sanitized environment. `timeoutMs` raises the default
 * 30-second bound for commands that run repository hooks, such as `git worktree add`.
 */
export async function runGit(
  cwd: string,
  args: string[],
  signal?: AbortSignal,
  timeoutMs?: number,
): Promise<string> {
  return (await execFileAsync("git", args, gitOptions(cwd, signal, timeoutMs))).stdout;
}

/** Run Git and treat an exit with status 128 (for example "not locked") as success. */
export async function runGitAllowFatal(
  cwd: string,
  args: string[],
  signal?: AbortSignal,
): Promise<void> {
  try {
    await runGit(cwd, args, signal);
  } catch (error) {
    if (expectedGitExitOutput(error, [128]) !== undefined) return;
    throw error;
  }
}
