// JSON-RPC 2.0 transport over stdio with Content-Length header framing.

import type { Readable, Writable } from "node:stream";
import type {
  JsonRpcMessage,
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse,
} from "./types.ts";

const CONTENT_LENGTH = "Content-Length: ";
const HEADER_DELIMITER = "\r\n\r\n";
const DEFAULT_TIMEOUT_MS = 30_000;

// ── Types ─────────────────────────────────────────────────────────────

export type NotificationHandler = (method: string, params: unknown) => void;

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ── JsonRpcClient ─────────────────────────────────────────────────────

export class JsonRpcClient {
  private nextId = 1;
  private buffer = Buffer.alloc(0);
  private pending = new Map<number, PendingRequest>();
  private notificationHandler: NotificationHandler | null = null;
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

  /** Send a request and wait for the correlated response. */
  sendRequest(method: string, params?: unknown): Promise<unknown> {
    if (this.closed) {
      return Promise.reject(new Error("JSON-RPC client is closed"));
    }

    const id = this.nextId++;
    const promise = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request ${method} (id=${id}) timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

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
    // eslint-disable-next-line no-constant-condition
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
      const pending = this.pending.get(response.id);
      if (pending) {
        this.pending.delete(response.id);
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
    }

    // Request from server (has id + method) — we don't handle server→client requests yet
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
