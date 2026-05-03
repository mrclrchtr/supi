import { execFileSync } from "node:child_process";

/**
 * Rewrite a bash command through RTK's `rtk rewrite` CLI.
 *
 * @param command The original shell command.
 * @param timeoutMs Timeout in milliseconds for the rewrite call.
 * @returns The rewritten command string, or `undefined` if RTK could not rewrite it
 *          (non-zero exit, timeout, or binary missing).
 */
export function rtkRewrite(command: string, timeoutMs: number): string | undefined {
  try {
    const result = execFileSync("rtk", ["rewrite", command], {
      encoding: "utf-8",
      timeout: timeoutMs,
    });
    return result.trim();
  } catch {
    return undefined;
  }
}
