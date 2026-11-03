import type { AnchoredResolutionMetadata, AnchoredResolutionSource } from "../../types/index.ts";

/**
 * Record one coordinate request independently of the provider's symbol-match category.
 * An exact identifier hit still snaps when normalized to a different name-anchor position.
 */
export function createAnchoredResolution(
  requested: AnchoredResolutionMetadata["requested"],
  resolved: AnchoredResolutionMetadata["resolved"],
  source: AnchoredResolutionSource,
): AnchoredResolutionMetadata {
  return {
    requested: { line: requested.line, character: requested.character },
    resolved: { line: resolved.line, character: resolved.character },
    snapped: requested.line !== resolved.line || requested.character !== resolved.character,
    source,
  };
}
