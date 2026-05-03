import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { parseReviewOutput } from "./parser.ts";
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
const MAX_EXCERPT_LENGTH = 2000;

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
  const { prompt, model, cwd, signal, target, onSessionStart } = inv;

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
    let settled = false;
    let sessionAnnounced = false;

    const cleanup = (result: ReviewResult) => {
      if (settled) return;
      settled = true;
      if (pollId) clearInterval(pollId);
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
        warning: `Review canceled. Sent interrupt to tmux session \`${sessionName}\`; if it remains active, kill it with \`tmux kill-session -t ${sessionName}\`.`,
      });
    };

    signal?.addEventListener("abort", onAbort, { once: true });

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
      if (!tmuxHasSession(sessionName)) {
        cleanup(buildTmuxResult({ ...paths, target }));
      }
    }, POLL_INTERVAL_MS);
  });
}

interface TmuxResultOptions {
  outputPath: string;
  paneLogPath: string;
  exitPath: string;
  target: ReviewTarget;
}

function buildTmuxResult(options: TmuxResultOptions): ReviewResult {
  const { outputPath, paneLogPath, exitPath, target } = options;
  const paneOutput = readPaneLog(paneLogPath);
  const exitStatus = readRunnerExitStatus(exitPath);
  const failedResult = getFailedExitResult(exitStatus, target, paneOutput);
  if (failedResult) return failedResult;

  const output = readStructuredOutput(outputPath);
  if (output) {
    return { kind: "success", output, target };
  }

  const warning = getStructuredFallbackWarning(outputPath);
  const reviewText = extractFinalAssistantContent(paneOutput) ?? paneOutput;
  const extracted = parseReviewOutput(reviewText);
  if (extracted.findings.length > 0 || extracted.overall_correctness !== "review incomplete") {
    return {
      kind: "success",
      output: extracted,
      target,
      warning: `${warning} Recovered a valid JSON object from the session output.`,
    };
  }

  const explanation = reviewText.trim();
  if (!explanation) {
    return makeFailedResult("Reviewer produced no output", target, warning);
  }

  return {
    kind: "success",
    output: {
      findings: [],
      overall_correctness: "review incomplete",
      overall_explanation: explanation,
      overall_confidence_score: 0,
    },
    target,
    warning: `${warning} The output is shown as plain text.`,
  };
}

function getFailedExitResult(
  exitStatus: ReturnType<typeof readRunnerExitStatus>,
  target: ReviewTarget,
  paneOutput: string,
): ReviewResult | undefined {
  if (!exitStatus) return undefined;
  const stderr = sliceExcerpt(paneOutput);
  if (exitStatus.error) {
    return {
      kind: "failed",
      reason: `Failed to spawn reviewer: ${exitStatus.error}`,
      target,
      stderr,
    };
  }
  if (typeof exitStatus.code === "number" && exitStatus.code !== 0) {
    return {
      kind: "failed",
      reason: `Reviewer exited with code ${exitStatus.code}`,
      target,
      stderr,
    };
  }
  if (exitStatus.signal) {
    return {
      kind: "failed",
      reason: `Reviewer exited from signal ${exitStatus.signal}`,
      target,
      stderr,
    };
  }
  return undefined;
}

function getStructuredFallbackWarning(outputPath: string): string {
  return existsSync(outputPath)
    ? "The reviewer submitted malformed JSON."
    : "The reviewer did not submit a structured result via the submit_review tool.";
}

function readPaneLog(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

function extractFinalAssistantContent(output: string): string | undefined {
  let lastContent: string | undefined;
  for (const line of output.split("\n")) {
    const event = parseJsonlEvent(line);
    if (event?.type !== "message_end") continue;
    const message = event.message ?? { role: event.role, content: event.content };
    if (message.role === "assistant") lastContent = flattenMessageContent(message.content);
  }
  return lastContent;
}

function parseJsonlEvent(line: string): JsonlEvent | undefined {
  const trimmed = line.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed) as JsonlEvent;
  } catch {
    return undefined;
  }
}

interface JsonlEvent {
  type?: string;
  message?: JsonlMessage;
  role?: string;
  content?: JsonlMessage["content"];
}

interface JsonlMessage {
  role?: string;
  content?: string | Array<{ text?: string }>;
}

function flattenMessageContent(content: JsonlMessage["content"]): string | undefined {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return undefined;
  return content.map((part) => part.text ?? "").join("");
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

function sliceExcerpt(text: string): string | undefined {
  return text ? text.slice(0, MAX_EXCERPT_LENGTH) : undefined;
}
