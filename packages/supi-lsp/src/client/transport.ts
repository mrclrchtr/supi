// JSON-RPC 2.0 transport — thin wrapper around vscode-jsonrpc.
// Handles Content-Length framing, request/response correlation, timeouts,
// and notification/request dispatching through vscode-jsonrpc's MessageConnection.

import type { Readable, Writable } from "node:stream";
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
    options?: { timeoutMs?: number },
  ): Promise<unknown> {
    if (this.closed || !this.connection) {
      return Promise.reject(new Error("JSON-RPC client is closed"));
    }

    const timeoutMs = options?.timeoutMs ?? this.timeoutMs;
    const tokenSource = new CancellationTokenSource();

    const timer = setTimeout(() => tokenSource.cancel(), timeoutMs);

    const request = this.connection.sendRequest(method, params, tokenSource.token);
    // Catch the raw request promise to prevent unhandled rejections when
    // dispose() cancels the token without a preceding timeout (the raced
    // promise below covers the timeout-then-dispose path separately).
    request.catch(() => {});

    // Race the request against a timeout so callers don't hang forever.
    // The CancellationToken is also passed to sendRequest so the connection
    // can short-circuit writes and cleanup when the token fires.
    const promise = Promise.race([
      request,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Request ${method} timed out after ${timeoutMs}ms`)),
          timeoutMs,
        ),
      ),
    ]).finally(() => clearTimeout(timer));

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
