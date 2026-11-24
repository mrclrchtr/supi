import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expectedGitExitOutput, sanitizedGitEnv } from "@mrclrchtr/supi-core/git";

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 30_000;

function gitOptions(cwd: string, signal?: AbortSignal) {
  return {
    cwd,
    env: sanitizedGitEnv(),
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: 50 * 1024 * 1024,
    ...(signal ? { signal } : {}),
  };
}

/** Run Git with bounded resources and a sanitized environment. */
export async function runGit(cwd: string, args: string[], signal?: AbortSignal): Promise<string> {
  return (await execFileAsync("git", args, gitOptions(cwd, signal))).stdout;
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
