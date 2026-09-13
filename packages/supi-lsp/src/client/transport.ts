// JSON-RPC 2.0 transport — thin wrapper around vscode-jsonrpc.
// Handles Content-Length framing, request/response correlation, timeouts,
// and notification/request dispatching through vscode-jsonrpc's MessageConnection.
// biome-ignore-all lint/style/noExcessiveLinesPerFile: Transport lifetime and protocol handling stay together.

import type { Readable, Writable } from "node:stream";
import {
  type CodeRequestControl,
  CodeRequestDeadlineError,
} from "@mrclrchtr/supi-code-runtime/api";
import {
  startDebugTimer,
  truncateDebugIdentity as truncateIdentity,
} from "@mrclrchtr/supi-core/debug";
import {
  CancellationTokenSource,
  createMessageConnection,
  ErrorCodes,
  type MessageConnection,
  NullLogger,
  ResponseError,
  StreamMessageReader,
  StreamMessageWriter,
} from "vscode-jsonrpc/node";
import { boundCwd, LSP_REQUEST_TIMEOUT_ERROR_CODE } from "../debug-telemetry.ts";

const DEFAULT_TIMEOUT_MS = 30_000;

// ── Types ─────────────────────────────────────────────────────────────

export type NotificationHandler = (method: string, params: unknown) => void;
export type RequestHandler = (method: string, params: unknown) => Promise<unknown> | unknown;

type RequestMethodClass = "diagnostic" | "lifecycle" | "other" | "refactor" | "semantic";
type RequestOutcome = "cancelled" | "completed" | "failed" | "timed-out";

/** Re-export ResponseError so callers don't need a separate vscode-jsonrpc import. */
const JsonRpcRequestError = ResponseError;

export { JsonRpcRequestError };

// ── JsonRpcClient ─────────────────────────────────────────────────────

export class JsonRpcClient {
  private connection: MessageConnection | null = null;
  private notificationHandler: NotificationHandler | null = null;
  private requestHandler: RequestHandler | null = null;
  private closed = false;
  private readonly timeoutMs: number;
  private readonly server: string | undefined;
  private readonly cwd: string | undefined;
  /** Failures that signal a stalled protocol: repeated errors and local timeouts. */
  private protocolFailureCount = 0;

  constructor(
    private readonly input: Readable,
    private readonly output: Writable,
    options?: { timeoutMs?: number; server?: string; cwd?: string },
  ) {
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.server = options?.server;
    this.cwd = options?.cwd;

    const reader = new StreamMessageReader(this.input);
    const writer = new StreamMessageWriter(this.output);

    this.connection = createMessageConnection(reader, writer, NullLogger);

    // Register catch-all notification handler
    this.connection.onNotification((method, params) => {
      this.notificationHandler?.(method, params);
    });

    // vscode-jsonrpc registers an internal $/progress handler that never
    // reaches the catch-all handler. Route it explicitly so LSP progress
    // notifications reach the client's readiness state machine.
    this.connection.onNotification("$/progress", (params) => {
      this.notificationHandler?.("$/progress", params);
    });

    // Register catch-all request handler for server-initiated requests
    this.connection.onRequest(async (method, params, _token) => {
      if (!this.requestHandler) {
        throw new JsonRpcRequestError(-32601, `Method not found: ${method}`);
      }
      return this.requestHandler(method, params);
    });

    // Handle connection close
    this.connection.onClose(() => {
      this.closed = true;
    });

    this.connection.listen();
  }

  /** Register a handler for server notifications (no id). */
  onNotification(handler: NotificationHandler): void {
    this.notificationHandler = handler;
  }

  /** Register a handler for server-initiated requests. */
  onRequest(handler: RequestHandler): void {
    this.requestHandler = handler;
  }

  /**
   * Send one request while exposing its underlying transport lifetime.
   * Callers that time out can stop waiting on `result` and keep the route
   * occupied until `settled` resolves.
   */
  sendRequestOwned(
    method: string,
    params?: unknown,
    options?: { timeoutMs?: number } & CodeRequestControl,
  ): { result: Promise<unknown>; settled: Promise<void> } {
    let settle!: () => void;
    const settled = new Promise<void>((resolve) => {
      settle = resolve;
    });
    let result: Promise<unknown>;
    try {
      result = this.sendRequest(method, params, {
        ...options,
        onSettled: settle,
        owned: true,
      });
    } catch (error) {
      settle();
      result = Promise.reject(error);
    }
    result.catch(() => {});
    return { result, settled };
  }

  /** Send a request and wait for the correlated response, optionally overriding the timeout. */
  // biome-ignore lint/complexity/noExcessiveLinesPerFunction: Request timeout and cancellation races stay together.
  sendRequest(
    method: string,
    params?: unknown,
    options?: { timeoutMs?: number; onSettled?: () => void; owned?: boolean } & CodeRequestControl,
  ): Promise<unknown> {
    const timeoutMs = options?.timeoutMs ?? this.timeoutMs;
    const owned = options?.owned === true;
    const signal = options?.signal;
    const deadlineMs = options?.deadline === undefined ? undefined : options.deadline - Date.now();
    const methodClass = classifyRequestMethod(method);
    const boundedMethod = truncateIdentity(method);
    const timer = startDebugTimer();
    // A request cancelled before dispatch must not produce protocol traffic.
    if (signal?.aborted) {
      const result = rejectUndispatchedRequest(
        signal.reason ?? new Error(`Request ${method} was cancelled`),
        {
          timer,
          operationId: options?.operationId,
          observation: { method: boundedMethod, methodClass, outcome: "cancelled" },
          identity: { server: this.server, cwd: this.cwd },
        },
      );
      options?.onSettled?.();
      return result;
    }
    // An expired absolute deadline must not even send the request: the caller
    // no longer awaits a result, so no protocol traffic may start.
    if (deadlineMs !== undefined && deadlineMs <= 0) {
      const result = rejectUndispatchedRequest(new CodeRequestDeadlineError(), {
        timer,
        operationId: options?.operationId,
        observation: {
          method: boundedMethod,
          methodClass,
          outcome: "timed-out",
          errorCode: LSP_REQUEST_TIMEOUT_ERROR_CODE,
        },
        identity: { server: this.server, cwd: this.cwd },
      });
      options?.onSettled?.();
      return result;
    }
    if (this.closed || !this.connection) {
      const result = rejectUndispatchedRequest(new Error("JSON-RPC client is closed"), {
        timer,
        operationId: options?.operationId,
        observation: { method: boundedMethod, methodClass, outcome: "cancelled" },
        identity: { server: this.server, cwd: this.cwd },
      });
      options?.onSettled?.();
      return result;
    }
    const tokenSource = new CancellationTokenSource();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let transportTimeout: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    let transportTimedOut = false;
    let aborted = false;
    const timerDelayMs = deadlineMs === undefined ? timeoutMs : Math.min(timeoutMs, deadlineMs);
    const timeoutError = Object.assign(
      new Error(`Request ${method} timed out after ${timerDelayMs}ms`),
      { code: LSP_REQUEST_TIMEOUT_ERROR_CODE },
    );
    const abortError = new Error(`Request ${method} was cancelled`);

    const request = this.connection.sendRequest(method, params, tokenSource.token);
    // Catch the raw request promise to prevent unhandled rejections when
    // dispose() cancels the token without a preceding timeout.
    request.catch(() => {});
    request.then(
      () => {
        if (transportTimeout !== undefined) clearTimeout(transportTimeout);
        options?.onSettled?.();
      },
      () => {
        if (transportTimeout !== undefined) clearTimeout(transportTimeout);
        options?.onSettled?.();
      },
    );
    if (owned) {
      const transportTimeoutMs = Number.isFinite(timeoutMs)
        ? Math.max(this.timeoutMs, timeoutMs)
        : this.timeoutMs;
      transportTimeout = setTimeout(() => {
        transportTimedOut = true;
        tokenSource.cancel();
      }, transportTimeoutMs);
    }

    // Race the request against the caller's timeout. Ordinary requests cancel
    // the JSON-RPC token; owned requests leave it active so the route stays
    // occupied until the raw request settles.
    let abortHandler: (() => void) | undefined;
    const abort = new Promise<never>((_resolve, reject) => {
      abortHandler = () => {
        aborted = true;
        if (!owned) tokenSource.cancel();
        // Reject with the caller's abort reason when one exists, matching the
        // canonical throwIfCodeRequestInterrupted() behavior.
        reject(signal?.reason ?? abortError);
      };
      if (signal?.aborted) abortHandler();
      else signal?.addEventListener("abort", abortHandler, { once: true });
    });
    const promise = Promise.race([
      request,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          timedOut = true;
          if (!owned) tokenSource.cancel();
          // A deadline that binds earlier than the timeout is a deadline
          // outcome, distinct from an ordinary per-request timeout.
          reject(
            deadlineMs !== undefined && deadlineMs < timeoutMs
              ? new CodeRequestDeadlineError()
              : timeoutError,
          );
        }, timerDelayMs);
      }),
      abort,
    ])
      .then(
        (result) => {
          recordRequestTiming(
            timer,
            options?.operationId,
            {
              method: boundedMethod,
              methodClass,
              outcome: "completed",
            },
            { server: this.server, cwd: this.cwd },
          );
          return result;
        },
        (error: unknown) => {
          const cancelled =
            timedOut || transportTimedOut || aborted || this.closed || isCancellationError(error);
          const outcome: RequestOutcome =
            timedOut || transportTimedOut ? "timed-out" : cancelled ? "cancelled" : "failed";
          const errorCode = requestErrorCode(outcome, error);
          this.countProtocolStallFailure(outcome, errorCode, error);
          recordRequestTiming(
            timer,
            options?.operationId,
            {
              method: boundedMethod,
              methodClass,
              outcome,
              // Failed requests record the server-reported JSON-RPC error code
              // when the error carries one; timed-out requests record the
              // defined timeout code (also for deadline expiries, whose error
              // carries none); cancellations carry no error code.
              errorCode,
            },
            { server: this.server, cwd: this.cwd },
          );
          throw error;
        },
      )
      .finally(() => {
        if (timeout !== undefined) clearTimeout(timeout);
        if (abortHandler) signal?.removeEventListener("abort", abortHandler);
      });

    // Prevent unhandled rejection when dispose() cancels requests
    promise.catch(() => {});
    return promise;
  }

  /**
   * Send a notification (no response expected).
   *
   * Returns the underlying write promise so ordering-sensitive cleanup paths
   * can await the final flush. A no-op catch is still attached to prevent
   * unhandled rejections when callers intentionally fire-and-forget.
   */
  sendNotification(method: string, params?: unknown): Promise<void> {
    if (this.closed || !this.connection) return Promise.resolve();
    const promise = this.connection.sendNotification(method, params);
    promise.catch(() => {});
    return promise;
  }

  /** Clean up the connection. */
  dispose(): void {
    this.closed = true;
    if (this.connection) {
      this.connection.dispose();
      this.connection = null;
    }
  }

  /**
   * Count one protocol-stall failure: a local timeout (not a caller-imposed
   * deadline expiry) or a repeated server-reported protocol error. A deadline
   * expiry is not a stall: the request may be perfectly healthy (ADR 0020).
   */
  private countProtocolStallFailure(
    outcome: RequestOutcome,
    errorCode: number | undefined,
    error: unknown,
  ): void {
    if (
      (outcome === "timed-out" && !(error instanceof CodeRequestDeadlineError)) ||
      errorCode === ErrorCodes.ServerNotInitialized ||
      errorCode === ErrorCodes.InvalidRequest
    ) {
      this.protocolFailureCount++;
    }
  }

  /** Number of protocol-stall failures observed on this connection. */
  getProtocolFailureCount(): number {
    return this.protocolFailureCount;
  }
}

const SEMANTIC_REQUESTS = new Set([
  "textDocument/definition",
  "textDocument/documentSymbol",
  "textDocument/hover",
  "textDocument/implementation",
  "textDocument/references",
  "workspace/symbol",
]);

/** Classify requests into bounded groups without retaining the raw method. */
function classifyRequestMethod(method: string): RequestMethodClass {
  if (method === "initialize" || method === "shutdown") return "lifecycle";
  if (method === "textDocument/diagnostic" || method === "workspace/diagnostic") {
    return "diagnostic";
  }
  if (method === "textDocument/codeAction" || method === "textDocument/rename") {
    return "refactor";
  }
  return SEMANTIC_REQUESTS.has(method) ? "semantic" : "other";
}

function isCancellationError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as Error & { code?: unknown }).code;
  return (
    code === -32_800 ||
    code === -32_802 ||
    error.name === "CancellationError" ||
    /\bcancell?ed\b/i.test(error.message)
  );
}

/** One bounded request-timing observation with exact method identity. */
interface RequestTimingObservation {
  readonly method: string;
  readonly methodClass: RequestMethodClass;
  readonly outcome: RequestOutcome;
  /** JSON-RPC error code reported by the server for a failed request. */
  readonly errorCode?: number;
}

/** Return the JSON-RPC error code for one request outcome. */
function requestErrorCode(outcome: RequestOutcome, error: unknown): number | undefined {
  if (outcome === "failed") return jsonRpcErrorCode(error);
  if (outcome === "timed-out") return jsonRpcErrorCode(error) ?? LSP_REQUEST_TIMEOUT_ERROR_CODE;
  return undefined;
}

/** Return the numeric JSON-RPC error code carried by an error, if any. */
function jsonRpcErrorCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "number" && Number.isInteger(code) ? code : undefined;
}

function rejectUndispatchedRequest(
  error: unknown,
  timing: {
    timer: ReturnType<typeof startDebugTimer>;
    operationId: string | undefined;
    observation: RequestTimingObservation;
    identity: { server?: string; cwd?: string };
  },
): Promise<never> {
  recordRequestTiming(timing.timer, timing.operationId, timing.observation, timing.identity);
  return Promise.reject(error);
}

function recordRequestTiming(
  timer: ReturnType<typeof startDebugTimer>,
  operationId: string | undefined,
  observation: RequestTimingObservation,
  identity: { server?: string; cwd?: string },
): void {
  timer.finish(
    () => ({
      operationId,
      source: "lsp",
      level: "debug",
      category: "request.timing",
      message: `LSP ${observation.methodClass} request ${observation.outcome} for ${observation.method}`,
      cwd: boundCwd(identity.cwd),
      data: {
        method: observation.method,
        methodClass: observation.methodClass,
        outcome: observation.outcome,
        ...(identity.server !== undefined ? { server: truncateIdentity(identity.server) } : {}),
        ...(observation.errorCode !== undefined ? { errorCode: observation.errorCode } : {}),
      },
    }),
    "request",
  );
}
