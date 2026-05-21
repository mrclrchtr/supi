// JSON-RPC 2.0 transport over stdio with Content-Length header framing.

import type { Readable, Writable } from "node:stream";
import type {
  JsonRpcId,
  JsonRpcMessage,
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse,
} from "../config/types.ts";

const CONTENT_LENGTH = "Content-Length: ";
const HEADER_DELIMITER = "\r\n\r\n";
const DEFAULT_TIMEOUT_MS = 30_000;

// ── Types ─────────────────────────────────────────────────────────────

export type NotificationHandler = (method: string, params: unknown) => void;
export type RequestHandler = (method: string, params: unknown) => Promise<unknown> | unknown;

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class JsonRpcRequestError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = "JsonRpcRequestError";
  }
}

// ── JsonRpcClient ─────────────────────────────────────────────────────

export class JsonRpcClient {
  private nextId = 1;
  private buffer = Buffer.alloc(0);
  private pending = new Map<JsonRpcId, PendingRequest>();
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
    this.input.on("data", (chunk: Buffer) => this.onData(chunk));
    this.input.on("end", () => this.onClose());
    this.input.on("error", () => this.onClose());
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
    if (this.closed) {
      return Promise.reject(new Error("JSON-RPC client is closed"));
    }

    const id = this.nextId++;
    const timeoutMs = options?.timeoutMs ?? this.timeoutMs;
    const promise = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request ${method} (id=${id}) timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
    });

    const msg: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };
    this.writeMessage(msg);

    // Prevent unhandled rejection when dispose() rejects orphaned promises
    promise.catch(() => {});
    return promise;
  }

  /** Send a notification (no response expected). */
  sendNotification(method: string, params?: unknown): void {
    if (this.closed) return;
    const msg: JsonRpcNotification = { jsonrpc: "2.0", method, params };
    this.writeMessage(msg);
  }

  /** Clean up all pending requests. */
  dispose(): void {
    this.closed = true;
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error("JSON-RPC client disposed"));
      this.pending.delete(id);
    }
  }

  // ── Private ───────────────────────────────────────────────────────

  private writeMessage(msg: JsonRpcMessage): void {
    const body = JSON.stringify(msg);
    const contentLength = Buffer.byteLength(body, "utf-8");
    const header = `${CONTENT_LENGTH}${contentLength}${HEADER_DELIMITER}`;
    this.output.write(header + body);
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    this.processBuffer();
  }

  private processBuffer(): void {
    while (true) {
      // Look for header delimiter
      const headerEnd = this.buffer.indexOf(HEADER_DELIMITER);
      if (headerEnd === -1) return;

      // Parse Content-Length from headers
      const headerText = this.buffer.subarray(0, headerEnd).toString("utf-8");
      const contentLength = parseContentLength(headerText);
      if (contentLength === null) {
        // Malformed header — skip past delimiter and try again
        this.buffer = this.buffer.subarray(headerEnd + HEADER_DELIMITER.length);
        continue;
      }

      // Check if we have the full body
      const bodyStart = headerEnd + HEADER_DELIMITER.length;
      const messageEnd = bodyStart + contentLength;
      if (this.buffer.length < messageEnd) {
        return; // Need more data — partial message
      }

      // Extract and parse the body
      const body = this.buffer.subarray(bodyStart, messageEnd).toString("utf-8");
      this.buffer = this.buffer.subarray(messageEnd);

      try {
        const msg = JSON.parse(body) as JsonRpcMessage;
        this.handleMessage(msg);
      } catch {
        // Malformed JSON — skip
      }
    }
  }

  private handleMessage(msg: JsonRpcMessage): void {
    // Response (has id, has result or error)
    if ("id" in msg && msg.id != null && ("result" in msg || "error" in msg)) {
      const response = msg as JsonRpcResponse;
      const id = response.id;
      if (id === null) return;
      const pending = this.pending.get(id);
      if (pending) {
        this.pending.delete(id);
        clearTimeout(pending.timer);
        if (response.error) {
          pending.reject(new Error(`LSP error ${response.error.code}: ${response.error.message}`));
        } else {
          pending.resolve(response.result);
        }
      }
      return;
    }

    // Notification (no id)
    if ("method" in msg && !("id" in msg)) {
      const notification = msg as JsonRpcNotification;
      this.notificationHandler?.(notification.method, notification.params);
      return;
    }

    // Request from server (has id + method)
    if ("method" in msg && "id" in msg && msg.id != null) {
      void this.handleInboundRequest(msg as JsonRpcRequest);
    }
  }

  private async handleInboundRequest(request: JsonRpcRequest): Promise<void> {
    if (this.closed) return;

    try {
      if (!this.requestHandler) {
        throw new JsonRpcRequestError(-32601, `Method not found: ${request.method}`);
      }

      const result = await this.requestHandler(request.method, request.params);
      this.writeMessage({
        jsonrpc: "2.0",
        id: request.id,
        result: result ?? null,
      } satisfies JsonRpcResponse);
    } catch (error) {
      const failure =
        error instanceof JsonRpcRequestError
          ? error
          : new JsonRpcRequestError(-32603, error instanceof Error ? error.message : String(error));
      this.writeMessage({
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: failure.code,
          message: failure.message,
          ...(failure.data !== undefined ? { data: failure.data } : {}),
        },
      } satisfies JsonRpcResponse);
    }
  }

  private onClose(): void {
    this.closed = true;
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error("JSON-RPC connection closed"));
      this.pending.delete(id);
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

function parseContentLength(header: string): number | null {
  for (const line of header.split("\r\n")) {
    if (line.startsWith(CONTENT_LENGTH)) {
      const value = parseInt(line.slice(CONTENT_LENGTH.length), 10);
      if (Number.isFinite(value) && value >= 0) return value;
    }
  }
  return null;
}
