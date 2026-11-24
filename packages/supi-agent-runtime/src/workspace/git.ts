import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 30_000;

function gitOptions(cwd: string, signal?: AbortSignal) {
  // Inherited GIT_* variables (for example from a hook) would redirect commands to another repository.
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("GIT_")) delete env[key];
  return {
    cwd,
    env,
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
    const failure = error as { code?: unknown; killed?: unknown; signal?: unknown };
    if (failure.code === 128 && failure.killed !== true && !failure.signal) return;
    throw error;
  }
}
