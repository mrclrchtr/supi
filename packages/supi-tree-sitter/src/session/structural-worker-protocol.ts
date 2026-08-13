// biome-ignore-all lint/style/noExcessiveLinesPerFile: one private protocol module defines and validates the full closed contract
import type { CodeRequestControl } from "@mrclrchtr/supi-code-runtime/api";
import type { TreeSitterResult } from "../types.ts";
import type { StructuralTimingEvent } from "./structural-timing.ts";

/** Version of the private parent/Structural Worker message contract. */
export const STRUCTURAL_WORKER_PROTOCOL_VERSION = 1 as const;

/** Fixed internal bounds for one Structural Worker lifecycle. */
export const STRUCTURAL_WORKER_LIMITS = Object.freeze({
  maxQueuedRequests: 32,
  maxMessageBytes: 512 * 1024,
  targetChunkBytes: 256 * 1024,
  maxResultBytes: 16 * 1024 * 1024,
  maxAtomicValueBytes: 256 * 1024,
  hardStopGraceMs: 250,
});

export type StructuralWorkerOperation =
  | { readonly operation: "canParse"; readonly file: string }
  | { readonly operation: "query"; readonly file: string; readonly query: string }
  | {
      readonly operation: "outline" | "imports" | "exports" | "callSites";
      readonly file: string;
    }
  | {
      readonly operation: "nodeAt";
      readonly file: string;
      readonly line: number;
      readonly character: number;
    }
  | {
      readonly operation: "calleesAt";
      readonly file: string;
      readonly line: number;
      readonly character: number;
      readonly depth?: "direct" | "deep";
    };

export interface StructuralWorkerRequestMessage {
  readonly kind: "request";
  readonly version: typeof STRUCTURAL_WORKER_PROTOCOL_VERSION;
  readonly generation: number;
  readonly requestId: string;
  readonly input: StructuralWorkerOperation;
  readonly deadline?: number;
  readonly cancellationFlag: SharedArrayBuffer;
}

export interface StructuralWorkerCancelMessage {
  readonly kind: "cancel";
  readonly version: typeof STRUCTURAL_WORKER_PROTOCOL_VERSION;
  readonly generation: number;
  readonly requestId: string;
}

export interface StructuralWorkerChunkAckMessage {
  readonly kind: "chunk-ack";
  readonly version: typeof STRUCTURAL_WORKER_PROTOCOL_VERSION;
  readonly generation: number;
  readonly requestId: string;
  readonly sequence: number;
}

export type ParentToStructuralWorkerMessage =
  | StructuralWorkerRequestMessage
  | StructuralWorkerCancelMessage
  | StructuralWorkerChunkAckMessage;

export interface StructuralWorkerReadyMessage {
  readonly kind: "ready";
  readonly version: typeof STRUCTURAL_WORKER_PROTOCOL_VERSION;
  readonly generation: number;
}

export interface StructuralWorkerStartupFailureMessage {
  readonly kind: "startup-failure";
  readonly version: typeof STRUCTURAL_WORKER_PROTOCOL_VERSION;
  readonly generation: number;
  readonly message: string;
}

export interface StructuralWorkerChunkMessage {
  readonly kind: "chunk";
  readonly version: typeof STRUCTURAL_WORKER_PROTOCOL_VERSION;
  readonly generation: number;
  readonly requestId: string;
  readonly sequence: number;
  readonly final: boolean;
  readonly encodedBytes: number;
  readonly payload: Uint8Array;
}

export interface StructuralWorkerObservationMessage {
  readonly kind: "observation";
  readonly version: typeof STRUCTURAL_WORKER_PROTOCOL_VERSION;
  readonly generation: number;
  readonly requestId: string;
  readonly observation: StructuralTimingEvent;
}

export interface StructuralWorkerTerminalMessage {
  readonly kind: "terminal";
  readonly version: typeof STRUCTURAL_WORKER_PROTOCOL_VERSION;
  readonly generation: number;
  readonly requestId: string;
  readonly outcome: "completed" | "cancelled" | "timeout";
}

export type StructuralWorkerToParentMessage =
  | StructuralWorkerReadyMessage
  | StructuralWorkerStartupFailureMessage
  | StructuralWorkerChunkMessage
  | StructuralWorkerObservationMessage
  | StructuralWorkerTerminalMessage;

export type StructuralProtocolValidation<T> =
  | { readonly kind: "valid"; readonly message: T }
  | { readonly kind: "invalid"; readonly reason: string };

/** Encode one complete structural result into fixed-size binary chunks. */
export function encodeStructuralResult(result: TreeSitterResult<unknown>): Uint8Array[] {
  assertPlainProtocolValue(result);
  const bytes = Buffer.from(JSON.stringify(result), "utf8");
  if (bytes.byteLength > STRUCTURAL_WORKER_LIMITS.maxResultBytes) {
    throw new Error(
      `Structural result exceeds the ${STRUCTURAL_WORKER_LIMITS.maxResultBytes}-byte limit`,
    );
  }
  const chunks: Uint8Array[] = [];
  for (
    let offset = 0;
    offset < bytes.byteLength;
    offset += STRUCTURAL_WORKER_LIMITS.targetChunkBytes
  ) {
    const end = Math.min(offset + STRUCTURAL_WORKER_LIMITS.targetChunkBytes, bytes.byteLength);
    chunks.push(Uint8Array.from(bytes.subarray(offset, end)));
  }
  return chunks.length > 0 ? chunks : [new Uint8Array()];
}

/** Reconstruct one complete structural result from validated binary chunks. */
export function decodeStructuralResult<T>(chunks: readonly Uint8Array[]): TreeSitterResult<T> {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  if (total > STRUCTURAL_WORKER_LIMITS.maxResultBytes) {
    throw new Error(
      `Structural result exceeds the ${STRUCTURAL_WORKER_LIMITS.maxResultBytes}-byte limit`,
    );
  }
  const parsed: unknown = JSON.parse(
    Buffer.concat(
      chunks.map((chunk) => Buffer.from(chunk)),
      total,
    ).toString("utf8"),
  );
  assertTreeSitterResult(parsed);
  return parsed as TreeSitterResult<T>;
}

/** Validate an untrusted message received from a Structural Worker. */
export function validateWorkerToParentMessage(
  value: unknown,
): StructuralProtocolValidation<StructuralWorkerToParentMessage> {
  if (!isRecord(value)) return invalid("Structural Worker message must be an object");
  if (value.version !== STRUCTURAL_WORKER_PROTOCOL_VERSION) {
    return invalid("Unsupported Structural Worker protocol version");
  }
  if (!isPositiveInteger(value.generation)) return invalid("Invalid Worker generation");
  switch (value.kind) {
    case "ready":
      return hasExactKeys(value, ["kind", "version", "generation"])
        ? valid(value as unknown as StructuralWorkerReadyMessage)
        : invalid("Invalid ready message");
    case "startup-failure":
      return hasExactKeys(value, ["kind", "version", "generation", "message"]) &&
        isBoundedString(value.message, 1_024)
        ? valid(value as unknown as StructuralWorkerStartupFailureMessage)
        : invalid("Invalid startup failure");
    case "chunk":
      return validateChunk(value);
    case "observation":
      return validateObservation(value);
    case "terminal":
      return validateTerminal(value);
    default:
      return invalid("Unknown Structural Worker message kind");
  }
}

/** Build the exact request control represented by one Worker request. */
export interface StructuralWorkerRequestControl extends CodeRequestControl {
  readonly cancellationFlag: Int32Array;
}

function validateChunk(
  value: Record<string, unknown>,
): StructuralProtocolValidation<StructuralWorkerChunkMessage> {
  if (
    !hasExactKeys(value, [
      "kind",
      "version",
      "generation",
      "requestId",
      "sequence",
      "final",
      "encodedBytes",
      "payload",
    ])
  ) {
    return invalid("Invalid chunk envelope");
  }
  if (!isRequestId(value.requestId)) return invalid("Invalid request id");
  if (!Number.isSafeInteger(value.sequence) || Number(value.sequence) < 0) {
    return invalid("Invalid chunk sequence");
  }
  if (typeof value.final !== "boolean") return invalid("Invalid final chunk marker");
  if (!(value.payload instanceof Uint8Array)) return invalid("Invalid chunk payload");
  if (value.encodedBytes !== value.payload.byteLength) return invalid("Invalid chunk byte count");
  if (value.payload.byteLength > STRUCTURAL_WORKER_LIMITS.targetChunkBytes) {
    return invalid("Structural Worker chunk exceeds the byte limit");
  }
  if (
    estimateChunkMessageBytes(value.payload.byteLength) > STRUCTURAL_WORKER_LIMITS.maxMessageBytes
  ) {
    return invalid("Structural Worker message exceeds the byte limit");
  }
  return valid(value as unknown as StructuralWorkerChunkMessage);
}

function validateObservation(
  value: Record<string, unknown>,
): StructuralProtocolValidation<StructuralWorkerObservationMessage> {
  if (!hasExactKeys(value, ["kind", "version", "generation", "requestId", "observation"])) {
    return invalid("Invalid observation envelope");
  }
  if (!isRequestId(value.requestId)) return invalid("Invalid request id");
  if (!isStructuralTimingEvent(value.observation)) return invalid("Invalid structural observation");
  return valid(value as unknown as StructuralWorkerObservationMessage);
}

function validateTerminal(
  value: Record<string, unknown>,
): StructuralProtocolValidation<StructuralWorkerTerminalMessage> {
  if (!hasExactKeys(value, ["kind", "version", "generation", "requestId", "outcome"])) {
    return invalid("Invalid terminal envelope");
  }
  if (!isRequestId(value.requestId)) return invalid("Invalid request id");
  if (
    value.outcome !== "completed" &&
    value.outcome !== "cancelled" &&
    value.outcome !== "timeout"
  ) {
    return invalid("Invalid terminal outcome");
  }
  return valid(value as unknown as StructuralWorkerTerminalMessage);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: every sanitized nested timing field is validated at one trust boundary
function isStructuralTimingEvent(value: unknown): value is StructuralTimingEvent {
  if (!isRecord(value) || !isRecord(value.data) || !isRecord(value.data.timing)) return false;
  if (!hasExactKeys(value, ["source", "level", "category", "message", "data"])) return false;
  if (value.source !== "tree-sitter" || value.level !== "debug") return false;
  if (
    value.category !== "structural.parse.timing" &&
    value.category !== "structural.query.timing"
  ) {
    return false;
  }
  if (
    !isBoundedString(value.message, 96) ||
    !/^Tree-sitter (?:parse|query) [a-z-]+$/.test(value.message)
  ) {
    return false;
  }
  if (!isGrammar(value.data.grammar)) return false;
  if (value.data.cache !== undefined && !isCacheObservation(value.data.cache)) return false;
  const timing = value.data.timing;
  if (!hasExactKeys(timing, ["durationMs", "phasesMs"]) || !isFiniteDuration(timing.durationMs)) {
    return false;
  }
  if (!isRecord(timing.phasesMs) || Object.keys(timing.phasesMs).length > 8) return false;
  if (
    Object.entries(timing.phasesMs).some(
      ([phase, duration]) => !/^[a-z-]{1,32}$/.test(phase) || !isFiniteDuration(duration),
    )
  ) {
    return false;
  }
  return value.category === "structural.parse.timing"
    ? isParseTimingData(value.data)
    : isQueryTimingData(value.data);
}

function assertTreeSitterResult(value: unknown): asserts value is TreeSitterResult<unknown> {
  if (!isRecord(value) || typeof value.kind !== "string")
    throw new Error("Invalid structural result");
  if (value.kind === "success" && "data" in value) return;
  if (
    value.kind === "unsupported-language" ||
    value.kind === "file-access-error" ||
    value.kind === "validation-error" ||
    value.kind === "runtime-error"
  ) {
    if (typeof value.message === "string") return;
  }
  throw new Error("Invalid structural result");
}

function assertPlainProtocolValue(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Structural result contains a non-finite number");
    return;
  }
  if (typeof value !== "object") throw new Error("Structural result contains an unsupported value");
  if (seen.has(value)) throw new Error("Structural result contains a cycle");
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) assertPlainProtocolValue(item, seen);
    seen.delete(value);
    return;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    const size = Buffer.byteLength(JSON.stringify(value) ?? "", "utf8");
    if (size > STRUCTURAL_WORKER_LIMITS.maxAtomicValueBytes) {
      throw new Error("Structural result contains an oversize indivisible value");
    }
    throw new Error("Structural result contains a non-plain value");
  }
  for (const item of Object.values(value)) assertPlainProtocolValue(item, seen);
  seen.delete(value);
}

function isParseTimingData(data: Record<string, unknown>): boolean {
  const expected =
    data.cache === undefined
      ? ["operation", "grammar", "parserState", "outcome", "timing"]
      : ["operation", "grammar", "parserState", "outcome", "cache", "timing"];
  if (!hasExactKeys(data, expected)) return false;
  return (
    data.operation === "parse" &&
    (data.parserState === "cold" ||
      data.parserState === "initializing" ||
      data.parserState === "reused") &&
    ["cancelled", "completed", "file-access-error", "runtime-error", "timeout"].includes(
      String(data.outcome),
    )
  );
}

function isQueryTimingData(data: Record<string, unknown>): boolean {
  if (!hasExactKeys(data, ["operation", "grammar", "outcome", "captureCount", "cache", "timing"])) {
    return false;
  }
  return (
    data.operation === "query" &&
    Number.isSafeInteger(data.captureCount) &&
    Number(data.captureCount) >= 0 &&
    ["cancelled", "completed", "runtime-error", "timeout", "validation-error"].includes(
      String(data.outcome),
    )
  );
}

function isCacheObservation(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["state", "retained", "evictionCount"]) &&
    (value.state === "hit" || value.state === "miss" || value.state === "replacement") &&
    typeof value.retained === "boolean" &&
    Number.isSafeInteger(value.evictionCount) &&
    Number(value.evictionCount) >= 0
  );
}

function isGrammar(value: unknown): boolean {
  return isBoundedString(value, 16) && /^[a-z]+$/.test(value);
}

function isFiniteDuration(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && expected.every((key) => actual.includes(key));
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function estimateChunkMessageBytes(payloadBytes: number): number {
  return payloadBytes + 1024;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isRequestId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

function valid<T>(message: T): StructuralProtocolValidation<T> {
  return { kind: "valid", message };
}

function invalid(reason: string): StructuralProtocolValidation<never> {
  return { kind: "invalid", reason };
}
