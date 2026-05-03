import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseReviewOutput } from "./parser.ts";
import type { ReviewResult, ReviewRunDiagnostics, ReviewTarget } from "./types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface RunnerOptions {
  timeout?: number;
}

const DEFAULT_TIMEOUT = 900_000;
const MAX_EXCERPT_LENGTH = 2000;

function makeFailedResult(
  reason: string,
  target: ReviewTarget,
  diagnostics: ReviewRunDiagnostics,
): ReviewResult {
  return {
    kind: "failed",
    reason,
    target,
    ...diagnostics,
  };
}

function buildExitResult(options: {
  code: number | null;
  stdout: string;
  stderr: string;
  target: ReviewTarget;
  cwd: string;
}): ReviewResult {
  const { code, stdout, stderr, target, cwd } = options;
  const diagnostics = collectRunDiagnostics(stdout, stderr, cwd);

  if (code !== 0) {
    return makeFailedResult(`Reviewer exited with code ${code ?? "unknown"}`, target, diagnostics);
  }

  const content = extractFinalAssistantContent(stdout);
  if (content === undefined) {
    return makeFailedResult("Reviewer produced no assistant output", target, diagnostics);
  }

  return {
    kind: "success",
    output: parseReviewOutput(content),
    target,
    sessionId: diagnostics.sessionId,
    sessionPath: diagnostics.sessionPath,
  };
}

function getPiInvocation(): { command: string; args: string[] } {
  const argv1 = process.argv[1];
  if (argv1 && (argv1.endsWith(".ts") || argv1.endsWith(".js") || argv1.endsWith(".mjs"))) {
    // Running from a script entrypoint — use the same interpreter.
    return { command: process.execPath, args: [argv1] };
  }
  // Generic runtime fallback.
  return { command: "pi", args: [] };
}

export interface ReviewerInvocation {
  prompt: string;
  model: string | undefined;
  cwd: string;
  signal?: AbortSignal;
  target: ReviewTarget;
  options?: RunnerOptions;
}

export async function runReviewer(inv: ReviewerInvocation): Promise<ReviewResult> {
  const { prompt, model, cwd, signal, target, options = {} } = inv;
  if (signal?.aborted) {
    return { kind: "canceled", target };
  }

  const { command, args: baseArgs } = getPiInvocation();

  const args = [
    ...baseArgs,
    "--mode",
    "json",
    "-p",
    // Keep session persistence enabled so timeouts/failures can be inspected later.
    "--no-extensions",
    "--no-themes",
    "--no-skills",
    "--no-prompt-templates",
    "--no-context-files",
    "--tools",
    "read,grep,find,ls",
    "--append-system-prompt",
    join(__dirname, "review-prompt.md"),
  ];

  if (model) {
    args.push("--model", model);
  }

  args.push(prompt);

  return new Promise<ReviewResult>((resolve) => {
    const timeoutMs = options.timeout ?? DEFAULT_TIMEOUT;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let killed = false;
    let stdout = "";
    let stderr = "";

    const proc = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    proc.stdout?.setEncoding("utf-8");
    proc.stderr?.setEncoding("utf-8");
    proc.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    proc.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });

    let killReason: "abort" | "timeout" | null = null;

    const cleanup = (result: ReviewResult) => {
      if (timeoutId) clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onAbort);
      resolve(result);
    };

    const onAbort = () => {
      if (killed) return;
      killed = true;
      killReason = "abort";
      proc.kill("SIGTERM");
      const killTimeout = setTimeout(() => {
        if (!proc.killed) {
          proc.kill("SIGKILL");
        }
      }, 5000);
      proc.on("exit", () => clearTimeout(killTimeout));
    };

    signal?.addEventListener("abort", onAbort);

    timeoutId = setTimeout(() => {
      if (killed) return;
      killed = true;
      killReason = "timeout";
      proc.kill("SIGTERM");
      const killTimeout = setTimeout(() => {
        if (!proc.killed) {
          proc.kill("SIGKILL");
        }
      }, 5000);
      proc.on("exit", () => clearTimeout(killTimeout));
      cleanup({
        kind: "timeout",
        target,
        timeoutMs,
        ...collectRunDiagnostics(stdout, stderr, cwd),
      });
    }, timeoutMs);

    proc.on("error", (err) => {
      if (killed) return;
      killed = true;
      cleanup(
        makeFailedResult(
          `Failed to spawn reviewer: ${err.message}`,
          target,
          collectRunDiagnostics(stdout, stderr, cwd),
        ),
      );
    });

    proc.on("exit", (code) => {
      if (killed) {
        if (killReason === "abort") {
          cleanup({
            kind: "canceled",
            target,
            ...collectRunDiagnostics(stdout, stderr, cwd),
          });
        }
        return;
      }
      killed = true;
      if (timeoutId) clearTimeout(timeoutId);
      cleanup(buildExitResult({ code, stdout, stderr, target, cwd }));
    });
  });
}

interface JsonlMessage {
  role?: string;
  content?: string | Array<{ type?: string; text?: string }>;
}

interface JsonlEvent {
  type?: string;
  message?: JsonlMessage;
  // Backward-compatible fallback for tests or alternate emitters.
  role?: string;
  content?: JsonlMessage["content"];
}

interface SessionHeader {
  type?: string;
  id?: string;
  timestamp?: string;
  cwd?: string;
}

function collectRunDiagnostics(stdout: string, stderr: string, cwd: string): ReviewRunDiagnostics {
  const sessionHeader = extractSessionHeader(stdout);
  return {
    sessionId: typeof sessionHeader?.id === "string" ? sessionHeader.id : undefined,
    sessionPath: getSessionPath(sessionHeader, cwd),
    stdout: sliceExcerpt(stdout),
    stderr: sliceExcerpt(stderr),
  };
}

function extractFinalAssistantContent(stdout: string): string | undefined {
  const lines = stdout.split("\n");
  let lastContent: string | undefined;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const event = JSON.parse(trimmed) as JsonlEvent;
      const message =
        event.message && typeof event.message === "object"
          ? event.message
          : { role: event.role, content: event.content };

      if (event.type === "message_end" && message.role === "assistant") {
        lastContent = flattenMessageContent(message.content);
      }
    } catch {
      // Ignore invalid JSONL lines.
    }
  }

  return lastContent;
}

function extractSessionHeader(stdout: string): SessionHeader | undefined {
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const event = JSON.parse(trimmed) as SessionHeader;
      if (event.type === "session") return event;
    } catch {
      // Ignore invalid JSONL lines.
    }
  }
  return undefined;
}

function getSessionPath(
  header: SessionHeader | undefined,
  fallbackCwd: string,
): string | undefined {
  const sessionId = typeof header?.id === "string" ? header.id : undefined;
  const timestamp = typeof header?.timestamp === "string" ? header.timestamp : undefined;
  if (!sessionId || !timestamp) return undefined;

  const sessionCwd =
    typeof header?.cwd === "string" && header.cwd.length > 0 ? header.cwd : fallbackCwd;
  const sessionDir = `--${sessionCwd.replace(/^[\\/]+/, "").replace(/[\\/]/g, "-")}--`;
  const fileName = `${timestamp.replaceAll(":", "-").replaceAll(".", "-")}_${sessionId}.jsonl`;
  return join(getPiAgentDir(), "sessions", sessionDir, fileName);
}

function getPiAgentDir(): string {
  const envDir = process.env.PI_CODING_AGENT_DIR?.trim();
  if (envDir) return resolve(envDir);
  return join(homedir(), ".pi", "agent");
}

function sliceExcerpt(text: string): string | undefined {
  if (!text) return undefined;
  return text.slice(0, MAX_EXCERPT_LENGTH);
}

function flattenMessageContent(content: JsonlMessage["content"]): string | undefined {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return undefined;
  return content
    .map((part) => (typeof part === "object" && part !== null ? (part.text ?? "") : ""))
    .join("");
}
