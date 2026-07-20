import type { EvidenceListMetadata } from "../../analysis/evidence.ts";

/** Render an explicit disclosure for unusable semantic-provider locations. */
export function renderInvalidProviderLocations(metadata: EvidenceListMetadata): string | null {
  const count = metadata.invalidLocationCount ?? 0;
  if (count <= 0 || metadata.partialReason === null) return null;
  const noun = count === 1 ? "location" : "locations";
  return `_${count} invalid provider ${noun} omitted (${metadata.partialReason})_`;
}
