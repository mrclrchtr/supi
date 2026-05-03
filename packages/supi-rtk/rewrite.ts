import { execFileSync } from "node:child_process";

/**
 * Rewrite a bash command through RTK's `rtk rewrite` CLI.
 *
 * @param command The original shell command.
 * @param timeoutMs Timeout in milliseconds for the rewrite call.
 * @returns The rewritten command string, or `undefined` if RTK could not rewrite it
 *          (timeout, binary missing, or non-zero exit without usable stdout).
 */
export function rtkRewrite(command: string, timeoutMs: number): string | undefined {
  try {
    const result = execFileSync("rtk", ["rewrite", command], {
      encoding: "utf-8",
      timeout: timeoutMs,
    });
    return result.trim();
  } catch (err: unknown) {
    // RTK can return a non-zero exit code while still emitting a valid rewrite.
    const stdout = (err as { stdout?: string | Buffer }).stdout;
    const text = typeof stdout === "string" ? stdout : stdout?.toString("utf-8");
    if (text && text.trim().length > 0) {
      return text.trim();
    }
    return undefined;
  }
}
