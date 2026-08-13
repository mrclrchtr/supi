import { describe, expect, it } from "vitest";
import {
  decodeStructuralResult,
  encodeStructuralResult,
  STRUCTURAL_WORKER_LIMITS,
  STRUCTURAL_WORKER_PROTOCOL_VERSION,
  validateStructuralWorkerRequest,
  validateWorkerToParentMessage,
} from "../../src/session/structural-worker-protocol.ts";

describe("Structural Worker protocol", () => {
  it("carries only the opaque Debug Operation ID in request control", () => {
    const operationId = "op-AAAAAAAAAAAAAAAAAAAAAA";
    const message = {
      kind: "request" as const,
      version: STRUCTURAL_WORKER_PROTOCOL_VERSION,
      generation: 1,
      requestId: "request-1",
      input: { operation: "outline" as const, file: "src/index.ts" },
      operationId,
      deadline: undefined,
      cancellationFlag: new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT),
    };

    expect(validateStructuralWorkerRequest(message)).toEqual({ kind: "valid", message });
    expect(validateStructuralWorkerRequest({ ...message, operationId: "raw-public-call" })).toEqual(
      { kind: "invalid", reason: "Invalid structural request" },
    );
    expect(JSON.stringify({ ...message, cancellationFlag: undefined })).not.toContain(
      "raw-public-call",
    );
  });
  it("chunks one large result within the fixed byte limits and reconstructs it exactly", () => {
    const result = {
      kind: "success" as const,
      data: [{ name: "large", text: "😀".repeat(200_000) }],
    };

    const encoded = encodeStructuralResult(result);

    expect(STRUCTURAL_WORKER_LIMITS).toEqual({
      maxQueuedRequests: 32,
      maxMessageBytes: 512 * 1024,
      targetChunkBytes: 256 * 1024,
      maxResultBytes: 16 * 1024 * 1024,
      maxAtomicValueBytes: 256 * 1024,
      hardStopGraceMs: 250,
    });
    expect(encoded.length).toBeGreaterThan(1);
    expect(encoded.every((chunk) => chunk.byteLength <= 256 * 1024)).toBe(true);
    expect(decodeStructuralResult(encoded)).toEqual(result);
  });

  it("rejects a malformed message instead of widening the protocol", () => {
    expect(
      validateWorkerToParentMessage({
        kind: "terminal",
        version: 999,
        generation: 1,
        requestId: "request-1",
        outcome: "completed",
      }),
    ).toEqual({ kind: "invalid", reason: "Unsupported Structural Worker protocol version" });
  });
});
