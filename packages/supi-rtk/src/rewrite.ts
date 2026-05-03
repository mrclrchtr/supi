import { execFileSync } from "node:child_process";

export type RtkRewriteFailureReason =
  | "timeout"
  | "unavailable"
  | "non-zero-exit"
  | "empty-output"
  | "error";

export type RtkRewriteResult =
  | {
      kind: "rewritten" | "unchanged";
      command: string;
      durationMs: number;
      stdout: string;
      stderr?: string;
    }
  | {
      kind: "failed";
      reason: RtkRewriteFailureReason;
      durationMs: number;
      stdout?: string;
      stderr?: string;
      exitCode?: number;
      errorMessage?: string;
    };

interface ExecErrorShape {
  code?: string;
  status?: number;
  signal?: string;
  stdout?: string | Buffer;
  stderr?: string | Buffer;
  message?: string;
}

function toText(value: string | Buffer | undefined): string | undefined {
  return typeof value === "string" ? value : value?.toString("utf-8");
}

function classifyError(err: ExecErrorShape): RtkRewriteFailureReason {
  const message = err.message?.toLowerCase() ?? "";
  if (err.code === "ENOENT") return "unavailable";
  if (err.code === "ETIMEDOUT" || message.includes("timeout") || message.includes("timed out")) {
    return "timeout";
  }
  if (typeof err.status === "number") return "non-zero-exit";
  return "error";
}

/**
 * Rewrite a bash command through RTK's `rtk rewrite` CLI with structured diagnostics.
 *
 * Non-zero RTK exits can still emit a usable rewrite on stdout; those are treated
 * as successful rewrites so callers preserve existing RTK behavior.
 */
export function rtkRewriteDetailed(command: string, timeoutMs: number): RtkRewriteResult {
  const started = Date.now();
  try {
    const stdout = execFileSync("rtk", ["rewrite", command], {
      encoding: "utf-8",
      timeout: timeoutMs,
    });
    const durationMs = Date.now() - started;
    const rewritten = stdout.trim();
    if (!rewritten) {
      return { kind: "failed", reason: "empty-output", durationMs, stdout };
    }
    return {
      kind: rewritten === command ? "unchanged" : "rewritten",
      command: rewritten,
      durationMs,
      stdout,
    };
  } catch (error: unknown) {
    const err = error as ExecErrorShape;
    const stdout = toText(err.stdout);
    const stderr = toText(err.stderr);
    const durationMs = Date.now() - started;
    const rewritten = stdout?.trim();
    if (rewritten) {
      return {
        kind: rewritten === command ? "unchanged" : "rewritten",
        command: rewritten,
        durationMs,
        stdout: stdout ?? "",
        stderr,
      };
    }
    return {
      kind: "failed",
      reason: classifyError(err),
      durationMs,
      stdout,
      stderr,
      exitCode: err.status,
      errorMessage: err.message,
    };
  }
}

/**
 * Rewrite a bash command through RTK's `rtk rewrite` CLI.
 *
 * @param command The original shell command.
 * @param timeoutMs Timeout in milliseconds for the rewrite call.
 * @returns The rewritten command string, or `undefined` if RTK could not rewrite it
 *          (timeout, binary missing, or non-zero exit without usable stdout).
 */
export function rtkRewrite(command: string, timeoutMs: number): string | undefined {
  const result = rtkRewriteDetailed(command, timeoutMs);
  return result.kind === "failed" ? undefined : result.command;
}
