import { type ChildProcess, spawn } from "node:child_process";
import { buildAntigravityEnvironment } from "./environment.ts";
import {
  BoundedLineParser,
  BoundedStderrCapture,
  MAX_STDOUT_BYTES,
  MAX_STDOUT_LINE_BYTES,
} from "./ndjson.ts";

const COMMAND = "agy";
const TERMINATION_GRACE_MS = 500;

/** Safe outcomes from a bounded non-stream Antigravity probe. */
export interface AntigravityProbeResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

/** Error raised for a failed Antigravity process or protocol. */
export class AntigravityProcessError extends Error {
  readonly kind: "missing" | "timeout" | "cancelled" | "stream" | "process" | "protocol";
  readonly exitCode: number | null | undefined;
  /** Bounded stderr retained for an in-memory caller, never put in result details. */
  readonly stderr: string | undefined;

  constructor(
    message: string,
    kind: AntigravityProcessError["kind"],
    options: { cause?: unknown; exitCode?: number | null; stderr?: string } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AntigravityProcessError";
    this.kind = kind;
    this.exitCode = options.exitCode;
    this.stderr = options.stderr;
  }
}

/** Options for one directly spawned, bounded agy process. */
export interface BoundedChildProcessOptions {
  args: string[];
  cwd: string;
  homeDir: string;
  prompt?: string;
  signal?: AbortSignal;
  timeoutMs: number;
  onLine: (line: string) => void;
  maxStdoutBytes?: number;
  allowNonZero?: boolean;
  onProcessStart?: () => void;
}

/** Spawn agy without a shell and apply stream, timeout, and process-group limits. */
export function runBoundedChildProcess(
  options: BoundedChildProcessOptions,
): Promise<AntigravityProbeResult> {
  if (process.platform !== "darwin" && process.platform !== "linux") {
    return Promise.reject(
      new AntigravityProcessError("Antigravity is supported on macOS and Linux only.", "process"),
    );
  }
  if (options.signal?.aborted) {
    return Promise.reject(
      new AntigravityProcessError("Antigravity run was canceled.", "cancelled"),
    );
  }

  return new Promise((resolve, reject) => {
    const parser = new BoundedLineParser({
      maxLineBytes: MAX_STDOUT_LINE_BYTES,
      maxTotalBytes: options.maxStdoutBytes ?? MAX_STDOUT_BYTES,
    });
    const stderr = new BoundedStderrCapture();
    let child: ChildProcess | undefined;
    let closed = false;
    let settled = false;
    let failure: Error | undefined;
    let closeResolve: (() => void) | undefined;
    const closePromise = new Promise<void>((resolveClose) => {
      closeResolve = resolveClose;
    });

    const finishReject = (error: Error): void => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const terminateAndReject = (error: Error): void => {
      if (settled || failure) return;
      failure = error;
      void terminateProcess(child, closePromise, () => closed).then(() => {
        finishReject(error);
      });
    };

    const timer = setTimeout(() => {
      terminateAndReject(new AntigravityProcessError("Antigravity process timed out.", "timeout"));
    }, options.timeoutMs);
    const onAbort = (): void => {
      terminateAndReject(new AntigravityProcessError("Antigravity run was canceled.", "cancelled"));
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      child = spawn(COMMAND, options.args, {
        cwd: options.cwd,
        env: buildAntigravityEnvironment(options.homeDir),
        detached: true,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      terminateAndReject(classifySpawnError(error));
      return;
    }

    child.stdout?.on("data", (chunk: Buffer | string) => {
      try {
        parser.feed(toBuffer(chunk), options.onLine);
      } catch (error) {
        terminateAndReject(
          error instanceof Error
            ? new AntigravityProcessError(error.message, "stream", { cause: error })
            : new AntigravityProcessError("Antigravity stdout exceeded its limits.", "stream"),
        );
      }
    });
    child.stderr?.on("data", (chunk: Buffer | string) => stderr.feed(toBuffer(chunk)));
    child.stdin?.on("error", (error) => terminateAndReject(classifySpawnError(error)));
    child.on("error", (error) => terminateAndReject(classifySpawnError(error)));
    child.on("close", (exitCode, signal) => {
      handleChildClose(exitCode, signal, {
        parser,
        options,
        stderr,
        setClosed: () => {
          closed = true;
          closeResolve?.();
        },
        clearTimer: () => clearTimeout(timer),
        removeAbortListener: () => options.signal?.removeEventListener("abort", onAbort),
        getFailure: () => failure,
        isSettled: () => settled,
        resolve: (result) => {
          settled = true;
          resolve(result);
        },
        fail: terminateAndReject,
      });
    });

    try {
      options.onProcessStart?.();
      if (options.prompt !== undefined) {
        const userEvent = JSON.stringify({
          event: "user",
          message: { role: "user", content: options.prompt },
        });
        child.stdin?.end(`${userEvent}\n`);
      } else {
        child.stdin?.end();
      }
    } catch (error) {
      terminateAndReject(classifySpawnError(error));
    }
  });
}

interface ChildCloseState {
  parser: BoundedLineParser;
  options: BoundedChildProcessOptions;
  stderr: BoundedStderrCapture;
  setClosed: () => void;
  clearTimer: () => void;
  removeAbortListener: () => void;
  getFailure: () => Error | undefined;
  isSettled: () => boolean;
  resolve: (result: AntigravityProbeResult) => void;
  fail: (error: Error) => void;
}

function handleChildClose(
  exitCode: number | null,
  signal: NodeJS.Signals | null,
  state: ChildCloseState,
): void {
  state.setClosed();
  state.clearTimer();
  state.removeAbortListener();
  if (state.getFailure()) return;
  try {
    state.parser.finish(state.options.onLine);
    ensureSuccessfulExit(exitCode, signal, state.options.allowNonZero, state.stderr.text());
    if (!state.isSettled()) {
      state.resolve({ exitCode, signal, stdout: "", stderr: state.stderr.text() });
    }
  } catch (error) {
    state.fail(toProtocolOrProcessError(error));
  }
}

function ensureSuccessfulExit(
  exitCode: number | null,
  signal: NodeJS.Signals | null,
  allowNonZero: boolean | undefined,
  stderr: string,
): void {
  if (allowNonZero || (exitCode === 0 && !signal)) return;
  throw new AntigravityProcessError(processFailureMessage(exitCode, signal), "process", {
    exitCode,
    stderr,
  });
}

function toProtocolOrProcessError(error: unknown): AntigravityProcessError {
  if (error instanceof AntigravityProcessError) return error;
  return new AntigravityProcessError("Antigravity returned an invalid stream.", "protocol", {
    cause: error,
  });
}

async function terminateProcess(
  child: ChildProcess | undefined,
  closePromise: Promise<void>,
  isClosed: () => boolean,
): Promise<void> {
  if (!child || isClosed()) return;
  sendProcessGroupSignal(child, "SIGTERM");
  await waitForClose(closePromise, TERMINATION_GRACE_MS);
  if (!isClosed()) {
    sendProcessGroupSignal(child, "SIGKILL");
    await waitForClose(closePromise, TERMINATION_GRACE_MS);
  }
}

function sendProcessGroupSignal(child: ChildProcess, signal: NodeJS.Signals): void {
  if (typeof child.pid !== "number") return;
  try {
    process.kill(-child.pid, signal);
    return;
  } catch {
    try {
      child.kill(signal);
    } catch {
      // The process may have exited between the two kill attempts.
    }
  }
}

async function waitForClose(closePromise: Promise<void>, timeoutMs: number): Promise<void> {
  await Promise.race([
    closePromise,
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

function toBuffer(chunk: Buffer | string): Buffer {
  return Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
}

function classifySpawnError(error: unknown): AntigravityProcessError {
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  return new AntigravityProcessError(
    code === "ENOENT" ? "Antigravity CLI was not found." : "Could not start Antigravity CLI.",
    code === "ENOENT" ? "missing" : "process",
    { cause: error },
  );
}

function processFailureMessage(exitCode: number | null, signal: NodeJS.Signals | null): string {
  if (signal) return `Antigravity process stopped with ${signal}.`;
  return `Antigravity process exited with code ${String(exitCode)}.`;
}
