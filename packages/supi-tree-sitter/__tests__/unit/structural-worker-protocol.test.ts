import { describe, expect, it } from "vitest";
import {
  decodeStructuralResult,
  encodeStructuralResult,
  STRUCTURAL_WORKER_LIMITS,
  STRUCTURAL_WORKER_PROTOCOL_VERSION,
  validateParentToStructuralWorkerMessage,
  validateStructuralWorkerCancel,
  validateStructuralWorkerChunkAck,
  validateStructuralWorkerOperation,
  validateStructuralWorkerRequest,
  validateWorkerToParentMessage,
} from "../../src/session/structural-worker-protocol.ts";

describe("Structural Worker protocol", () => {
  it("validates every Structural Worker operation before admission", () => {
    const validOperations = [
      { operation: "canParse", file: "src/index.ts" },
      { operation: "query", file: "src/index.ts", query: "(identifier) @name" },
      { operation: "outline", file: "src/index.ts" },
      { operation: "imports", file: "src/index.ts" },
      { operation: "exports", file: "src/index.ts" },
      { operation: "callSites", file: "src/index.ts" },
      { operation: "nodeAt", file: "src/index.ts", line: 1, character: 1 },
      { operation: "calleesAt", file: "src/index.ts", line: 1, character: 1, depth: "deep" },
    ];
    for (const operation of validOperations) {
      expect(validateStructuralWorkerOperation(operation).kind).toBe("valid");
    }

    const invalidOperations = [
      { operation: "unknown", file: "src/index.ts" },
      { operation: "outline", file: "src/index.ts", extra: true },
      { operation: "nodeAt", file: "src/index.ts", line: 0, character: 1 },
      { operation: "nodeAt", file: "src/index.ts", line: 1, character: 0 },
      { operation: "outline", file: "" },
      { operation: "query", file: "src/index.ts", query: "" },
      { operation: "calleesAt", file: "src/index.ts", line: 1, character: 1, depth: "sideways" },
    ];
    for (const operation of invalidOperations) {
      expect(validateStructuralWorkerOperation(operation).kind).toBe("invalid");
    }
  });

  it("applies operation validation at the Worker request seam", () => {
    const message = {
      kind: "request" as const,
      version: STRUCTURAL_WORKER_PROTOCOL_VERSION,
      generation: 1,
      requestId: "request-1",
      input: {
        operation: "calleesAt",
        file: "src/index.ts",
        line: 1,
        character: 1,
        depth: "sideways",
      },
      cancellationFlag: new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT),
    };

    expect(validateStructuralWorkerRequest(message).kind).toBe("invalid");
  });

  it("closes request, cancel, and chunk acknowledgement envelopes", () => {
    const request = {
      kind: "request" as const,
      version: STRUCTURAL_WORKER_PROTOCOL_VERSION,
      generation: 1,
      requestId: "request-1",
      input: { operation: "outline" as const, file: "src/index.ts" },
      cancellationFlag: new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT),
    };
    const cancel = {
      kind: "cancel" as const,
      version: STRUCTURAL_WORKER_PROTOCOL_VERSION,
      generation: 1,
      requestId: "request-1",
    };
    const acknowledgement = {
      kind: "chunk-ack" as const,
      version: STRUCTURAL_WORKER_PROTOCOL_VERSION,
      generation: 1,
      requestId: "request-1",
      sequence: 0,
    };

    expect(validateParentToStructuralWorkerMessage(request).kind).toBe("valid");
    expect(validateStructuralWorkerCancel(cancel).kind).toBe("valid");
    expect(validateStructuralWorkerChunkAck(acknowledgement).kind).toBe("valid");

    const validators = [
      validateStructuralWorkerRequest,
      validateStructuralWorkerCancel,
      validateStructuralWorkerChunkAck,
    ];
    for (const validate of validators) {
      for (const value of [null, undefined, 1, "message", []]) {
        expect(validate(value).kind).toBe("invalid");
      }
    }

    expect(validateStructuralWorkerRequest({ ...request, extra: true }).kind).toBe("invalid");
    expect(validateStructuralWorkerCancel({ ...cancel, extra: true }).kind).toBe("invalid");
    expect(validateStructuralWorkerChunkAck({ ...acknowledgement, extra: true }).kind).toBe(
      "invalid",
    );
    expect(validateStructuralWorkerChunkAck({ ...acknowledgement, sequence: "0" }).kind).toBe(
      "invalid",
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
