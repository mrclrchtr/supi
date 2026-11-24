// supi-core git domain — process environment and exit-code helpers for Git child processes.
// Callers keep their own timeout, output buffer, and exit-code policy.

/**
 * Copy the process environment without inherited `GIT_*` variables, then apply caller overrides.
 *
 * Inherited variables such as `GIT_DIR` or `GIT_INDEX_FILE` (for example from a Git hook) would
 * redirect commands to another repository or index. Callers add the Git variables they need, such
 * as `GIT_INDEX_FILE` or `GIT_TERMINAL_PROMPT`, through `overrides`. `process.env` is not modified.
 */
export function sanitizedGitEnv(overrides?: Readonly<Record<string, string>>): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("GIT_")) delete env[key];
  return overrides ? Object.assign(env, overrides) : env;
}

/**
 * Return Git's standard output when an `execFile` error is a normal exit with an allowed code.
 *
 * Returns `undefined` for every other failure, including spawn errors, timeouts, aborts, and
 * signals, so callers can rethrow operational failures. Buffer output is decoded as UTF-8; a
 * missing output becomes an empty string.
 */
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
