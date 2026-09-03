/** Limits for streamed Antigravity output. */
export const MAX_STDOUT_LINE_BYTES = 128 * 1024;
export const MAX_STDOUT_BYTES = 5 * 1024 * 1024;
export const MAX_STREAM_EVENTS = 512;
export const MAX_RETAINED_STDERR_BYTES = 8 * 1024;

/** Error raised when a process stream exceeds a package-owned bound. */
export class StreamLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StreamLimitError";
  }
}

/**
 * Incrementally parses newline-delimited text without buffering an oversized line.
 * The callback runs as soon as each complete line arrives.
 */
export class BoundedLineParser {
  readonly #maxLineBytes: number;
  readonly #maxTotalBytes: number;
  #lineParts: Buffer[] = [];
  #lineBytes = 0;
  #totalBytes = 0;

  constructor(
    options: {
      maxLineBytes?: number;
      maxTotalBytes?: number;
    } = {},
  ) {
    this.#maxLineBytes = options.maxLineBytes ?? MAX_STDOUT_LINE_BYTES;
    this.#maxTotalBytes = options.maxTotalBytes ?? MAX_STDOUT_BYTES;
  }

  get totalBytes(): number {
    return this.#totalBytes;
  }

  feed(chunk: Uint8Array, onLine: (line: string) => void): void {
    this.#totalBytes += chunk.byteLength;
    if (this.#totalBytes > this.#maxTotalBytes) {
      throw new StreamLimitError("Antigravity stdout exceeded its byte limit.");
    }

    let start = 0;
    for (let index = 0; index < chunk.byteLength; index += 1) {
      if (chunk[index] !== 10) continue;
      this.#append(chunk.subarray(start, index));
      onLine(this.#takeLine());
      start = index + 1;
    }
    this.#append(chunk.subarray(start));
  }

  finish(onLine: (line: string) => void): void {
    if (this.#lineBytes === 0) return;
    onLine(this.#takeLine());
  }

  #append(part: Uint8Array): void {
    if (part.byteLength === 0) return;
    this.#lineBytes += part.byteLength;
    if (this.#lineBytes > this.#maxLineBytes) {
      throw new StreamLimitError("An Antigravity stdout line exceeded its byte limit.");
    }
    this.#lineParts.push(Buffer.from(part));
  }

  #takeLine(): string {
    const line = Buffer.concat(this.#lineParts, this.#lineBytes).toString("utf8");
    this.#lineParts = [];
    this.#lineBytes = 0;
    return line.endsWith("\r") ? line.slice(0, -1) : line;
  }
}

/** A bounded stderr collector used only to explain process failures. */
export class BoundedStderrCapture {
  readonly #maxBytes: number;
  #parts: Buffer[] = [];
  #bytes = 0;
  #truncated = false;

  constructor(maxBytes = MAX_RETAINED_STDERR_BYTES) {
    this.#maxBytes = maxBytes;
  }

  feed(chunk: Uint8Array): void {
    if (this.#bytes >= this.#maxBytes) {
      this.#truncated = true;
      return;
    }
    const remaining = this.#maxBytes - this.#bytes;
    const part = Buffer.from(chunk.subarray(0, remaining));
    this.#parts.push(part);
    this.#bytes += part.byteLength;
    if (part.byteLength < chunk.byteLength) this.#truncated = true;
  }

  text(): string {
    const value = Buffer.concat(this.#parts).toString("utf8").trim();
    return this.#truncated ? `${value}\n[stderr truncated]`.trim() : value;
  }
}

/** Parse one bounded NDJSON line and reject malformed JSON. */
export function parseNdjsonLine(line: string): Record<string, unknown> | undefined {
  if (!line.trim()) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (error) {
    throw new Error("Antigravity returned malformed NDJSON.", { cause: error });
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Antigravity returned a non-object NDJSON event.");
  }
  return parsed as Record<string, unknown>;
}
