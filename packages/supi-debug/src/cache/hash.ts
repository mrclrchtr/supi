// Fast non-crypto hash for system prompt change detection.
// Uses FNV-1a for speed — not cryptographic, just collision-resistant enough
// for detecting prompt text changes between consecutive turns.

/**
 * Compute a fast non-cryptographic hash of a string.
 * Uses the FNV-1a algorithm (32-bit).
 */
export function fastHash(str: string): number {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  return hash >>> 0; // ensure unsigned 32-bit
}
