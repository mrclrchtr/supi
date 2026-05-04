import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import {
  buildPiArgs,
  generateReviewId,
  getPiInvocation,
  getTempPaths,
  makeFailedResult,
  readRunnerExitStatus,
  readStructuredOutput,
  writeSubmitReviewTool,
  writeTmuxRunnerScript,
} from "./runner-shared.ts";
import type { ReviewerInvocation } from "./runner-types.ts";
import type { ReviewResult, ReviewTarget } from "./types.ts";

export type { ReviewerInvocation } from "./runner-types.ts";

const POLL_INTERVAL_MS = 1_000;
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1_000;

function isTmuxAvailable(): boolean {
  const result = spawnSync("tmux", ["-V"], { encoding: "utf-8" });
  return result.error === undefined && result.status === 0;
}

function tmuxHasSession(name: string): boolean {
  const result = spawnSync("tmux", ["has-session", "-t", name], { encoding: "utf-8" });
  return result.status === 0;
}

function tmuxSendInterrupt(name: string): void {
  spawnSync("tmux", ["send-keys", "-t", name, "C-c"], { encoding: "utf-8" });
}

function tmuxKillSession(name: string): void {
  spawnSync("tmux", ["kill-session", "-t", name], { encoding: "utf-8" });
}

function getTmuxSessionName(id: string, attempt = 0): string {
  return attempt === 0 ? `supi-review-${id}` : `supi-review-${id}-${attempt}`;
}

export async function runReviewer(inv: ReviewerInvocation): Promise<ReviewResult> {
  const {
    prompt,
    model,
    cwd,
    signal,
    target,
    onSessionStart,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = inv;

  if (signal?.aborted) {
    return { kind: "canceled", target };
  }

  if (!isTmuxAvailable()) {
    return makeFailedResult("tmux is required for supi-review. Install tmux and retry.", target);
  }

  const id = generateReviewId();
  const paths = getTempPaths(id);
  const sessionName = resolveSessionName(id);
  writeSubmitReviewTool(paths.toolPath, paths.outputPath);

  const { command, args: baseArgs } = getPiInvocation();
  const piArgs = [...baseArgs, ...buildPiArgs({ model, toolPath: paths.toolPath, prompt })];
  writeTmuxRunnerScript({
    runnerPath: paths.runnerPath,
    command,
    args: piArgs,
    paneLogPath: paths.paneLogPath,
    exitPath: paths.exitPath,
  });

  const proc = spawn(
    "tmux",
    ["new-session", "-d", "-s", sessionName, "--", process.execPath, paths.runnerPath],
    {
      cwd,
      stdio: "ignore",
    },
  );

  return new Promise<ReviewResult>((resolve) => {
    let pollId: ReturnType<typeof setInterval> | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    let sessionAnnounced = false;

    const cleanup = (result: ReviewResult) => {
      if (settled) return;
      settled = true;
      if (pollId) clearInterval(pollId);
      if (timeoutId) clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onAbort);
      if (result.kind === "success") {
        cleanupTempFiles([
          paths.toolPath,
          paths.outputPath,
          paths.paneLogPath,
          paths.runnerPath,
          paths.exitPath,
        ]);
      }
      resolve(result);
    };

    const onAbort = () => {
      tmuxSendInterrupt(sessionName);
      const killTimer = setTimeout(() => killSessionIfPresent(sessionName), 5000);
      killTimer.unref?.();
      cleanup({
        kind: "canceled",
        target,
        warning: [
          `Review canceled. Sent interrupt to tmux session \`${sessionName}\`.`,
          `If it remains active, kill it with \`tmux kill-session -t ${sessionName}\`.`,
        ].join(" "),
      });
    };

    const onTimeout = () => {
      tmuxSendInterrupt(sessionName);
      const killTimer = setTimeout(() => killSessionIfPresent(sessionName), 5000);
      killTimer.unref?.();
      cleanup({
        kind: "timeout",
        target,
        timeoutMs,
        stdout: readPaneLogExcerpt(paths.paneLogPath),
        warning: formatSessionWarning(sessionName, paths.paneLogPath),
      });
    };

    signal?.addEventListener("abort", onAbort, { once: true });
    timeoutId = setTimeout(onTimeout, timeoutMs);
    timeoutId.unref?.();

    proc.on("error", (err) => {
      cleanup(makeFailedResult(`Failed to spawn tmux reviewer: ${err.message}`, target));
    });

    proc.on("exit", (code) => {
      if (settled) return;
      if (code === 0 || code === null) {
        if (!sessionAnnounced && tmuxHasSession(sessionName)) {
          sessionAnnounced = true;
          onSessionStart?.(sessionName);
        }
        return;
      }
      cleanup(
        makeFailedResult(`Failed to start tmux reviewer: tmux exited with code ${code}`, target),
      );
    });

    pollId = setInterval(() => {
      if (existsSync(paths.exitPath)) {
        cleanup(buildTmuxResult({ ...paths, sessionName, target }));
        return;
      }
      if (!tmuxHasSession(sessionName)) {
        cleanup(buildTmuxResult({ ...paths, sessionName, target }));
      }
    }, POLL_INTERVAL_MS);
  });
}

interface TmuxResultOptions {
  outputPath: string;
  exitPath: string;
  paneLogPath: string;
  sessionName: string;
  target: ReviewTarget;
}

function buildTmuxResult(options: TmuxResultOptions): ReviewResult {
  const { outputPath, exitPath, target } = options;
  const exitStatus = readRunnerExitStatus(exitPath);
  const failedResult = getFailedExitResult(exitStatus, options);
  if (failedResult) return failedResult;

  const output = readStructuredOutput(outputPath);
  if (output) {
    return { kind: "success", output, target };
  }

  return withDiagnostics(
    {
      kind: "failed",
      reason: "Reviewer did not submit a structured result via submit_review.",
      target,
    },
    options,
  );
}

function getFailedExitResult(
  exitStatus: ReturnType<typeof readRunnerExitStatus>,
  options: TmuxResultOptions,
): ReviewResult | undefined {
  if (!exitStatus) return undefined;
  const { target } = options;
  if (exitStatus.error) {
    return withDiagnostics(
      {
        kind: "failed",
        reason: `Failed to spawn reviewer: ${exitStatus.error}`,
        target,
      },
      options,
    );
  }
  if (typeof exitStatus.code === "number" && exitStatus.code !== 0) {
    return withDiagnostics(
      {
        kind: "failed",
        reason: `Reviewer exited with code ${exitStatus.code}`,
        target,
      },
      options,
    );
  }
  if (exitStatus.signal) {
    return withDiagnostics(
      {
        kind: "failed",
        reason: `Reviewer exited from signal ${exitStatus.signal}`,
        target,
      },
      options,
    );
  }
  return undefined;
}

function withDiagnostics(
  result: Extract<ReviewResult, { kind: "failed" }>,
  options: Pick<TmuxResultOptions, "paneLogPath" | "sessionName">,
): ReviewResult {
  return {
    ...result,
    stdout: readPaneLogExcerpt(options.paneLogPath),
    warning: formatSessionWarning(options.sessionName, options.paneLogPath),
  };
}

function readPaneLogExcerpt(paneLogPath: string): string | undefined {
  if (!existsSync(paneLogPath)) return undefined;
  try {
    const content = readFileSync(paneLogPath, "utf-8");
    return content.slice(-4000) || undefined;
  } catch {
    return undefined;
  }
}

function formatSessionWarning(sessionName: string, paneLogPath: string): string {
  return [
    `Review logs are in ${paneLogPath}.`,
    `Inspect with \`tmux attach -t ${sessionName}\`;`,
    `clean up with \`tmux kill-session -t ${sessionName}\`.`,
  ].join(" ");
}

function resolveSessionName(id: string): string {
  let sessionName = getTmuxSessionName(id);
  let sessionAttempt = 0;
  while (tmuxHasSession(sessionName)) {
    sessionAttempt++;
    sessionName = getTmuxSessionName(id, sessionAttempt);
  }
  return sessionName;
}

function killSessionIfPresent(sessionName: string): void {
  if (tmuxHasSession(sessionName)) {
    tmuxKillSession(sessionName);
  }
}

function cleanupTempFiles(paths: string[]): void {
  for (const path of paths) {
    try {
      unlinkSync(path);
    } catch {
      // ignore
    }
  }
}
