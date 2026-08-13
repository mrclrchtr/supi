import { describe, expect, it } from "vitest";
import {
  decodeStructuralResult,
  encodeStructuralResult,
  STRUCTURAL_WORKER_LIMITS,
  validateWorkerToParentMessage,
} from "../../src/session/structural-worker-protocol.ts";

describe("Structural Worker protocol", () => {
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
