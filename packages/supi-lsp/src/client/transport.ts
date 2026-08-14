// JSON-RPC 2.0 transport — thin wrapper around vscode-jsonrpc.
// Handles Content-Length framing, request/response correlation, timeouts,
// and notification/request dispatching through vscode-jsonrpc's MessageConnection.

import type { Readable, Writable } from "node:stream";
import type { CodeRequestControl } from "@mrclrchtr/supi-code-runtime/api";
import { startDebugTimer } from "@mrclrchtr/supi-core/debug";
import {
  CancellationTokenSource,
  createMessageConnection,
  type MessageConnection,
  NullLogger,
  ResponseError,
  StreamMessageReader,
  StreamMessageWriter,
} from "vscode-jsonrpc/node";

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

  constructor(
    private readonly input: Readable,
    private readonly output: Writable,
    options?: { timeoutMs?: number },
  ) {
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

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

  /** Send a request and wait for the correlated response, optionally overriding the timeout. */
  sendRequest(
    method: string,
    params?: unknown,
    options?: { timeoutMs?: number } & CodeRequestControl,
  ): Promise<unknown> {
    const timeoutMs = options?.timeoutMs ?? this.timeoutMs;
    const signal = options?.signal;
    const methodClass = classifyRequestMethod(method);
    const timer = startDebugTimer();
    if (this.closed || !this.connection) {
      recordRequestTiming(timer, options?.operationId, {
        methodClass,
        outcome: "cancelled",
      });
      return Promise.reject(new Error("JSON-RPC client is closed"));
    }

    const tokenSource = new CancellationTokenSource();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    let aborted = false;
    const timeoutError = new Error(`Request ${method} timed out after ${timeoutMs}ms`);
    const abortError = new Error(`Request ${method} was cancelled`);

    const request = this.connection.sendRequest(method, params, tokenSource.token);
    // Catch the raw request promise to prevent unhandled rejections when
    // dispose() cancels the token without a preceding timeout.
    request.catch(() => {});

    // Race the request against a single shared timeout that both cancels
    // the JSON-RPC token and rejects the caller. Using one timer avoids
    // a leak where the rejecting timer in a second Promise stays alive
    // after a successful response.
    let abortHandler: (() => void) | undefined;
    const abort = new Promise<never>((_resolve, reject) => {
      abortHandler = () => {
        aborted = true;
        tokenSource.cancel();
        reject(abortError);
      };
      if (signal?.aborted) abortHandler();
      else signal?.addEventListener("abort", abortHandler, { once: true });
    });
    const promise = Promise.race([
      request,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          timedOut = true;
          tokenSource.cancel();
          reject(timeoutError);
        }, timeoutMs);
      }),
      abort,
    ])
      .then(
        (result) => {
          recordRequestTiming(timer, options?.operationId, {
            methodClass,
            outcome: "completed",
          });
          return result;
        },
        (error: unknown) => {
          const cancelled = timedOut || aborted || this.closed || isCancellationError(error);
          const outcome: RequestOutcome = timedOut
            ? "timed-out"
            : cancelled
              ? "cancelled"
              : "failed";
          recordRequestTiming(timer, options?.operationId, {
            methodClass,
            outcome,
          });
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

interface RequestTimingObservation {
  readonly methodClass: RequestMethodClass;
  readonly outcome: RequestOutcome;
}

function recordRequestTiming(
  timer: ReturnType<typeof startDebugTimer>,
  operationId: string | undefined,
  observation: RequestTimingObservation,
): void {
  timer.finish(
    () => ({
      operationId,
      source: "lsp",
      level: "debug",
      category: "request.timing",
      message: `LSP ${observation.methodClass} request ${observation.outcome}`,
      data: { ...observation },
    }),
    "request",
  );
}
