import { STRUCTURAL_WORKER_LIMITS } from "./structural-worker-protocol.ts";

/** Approximate encoded UTF-8 bytes for one plain protocol envelope. */
export function structuralProtocolMessageBytes(message: unknown): number {
  try {
    return Buffer.byteLength(
      JSON.stringify(message, (_key, value) => {
        if (value instanceof SharedArrayBuffer) return { sharedBytes: value.byteLength };
        if (value instanceof Uint8Array) return { binaryBytes: value.byteLength };
        return value;
      }),
      "utf8",
    );
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/** Throw before an oversize protocol envelope crosses a thread boundary. */
export function assertStructuralProtocolMessageSize(message: unknown): void {
  if (structuralProtocolMessageBytes(message) > STRUCTURAL_WORKER_LIMITS.maxMessageBytes) {
    throw new Error("Structural Worker message exceeds the byte limit");
  }
}
