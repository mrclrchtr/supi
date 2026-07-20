/**
 * Semantic caller collection — finds references for a target.
 *
 * Returns typed caller data with explicit evidence metadata
 * ("semantic-references" since we use LSP references as caller evidence).
 */

import {
  isTargetLocation,
  normalizeProviderLocations,
  normalizeTargetFile,
  type RelationLocationPartialReason,
} from "./provider-locations.ts";
import type { CallerEvidence, CallerReference, RelationsServiceDeps } from "./types.ts";

export interface CallersResult {
  kind: "callers";
  targetName: string;
  references: CallerReference[];
  externalCount: number;
  /** Provider locations omitted because their URI or position was unusable. */
  invalidLocationCount: number;
  partialReason: RelationLocationPartialReason | null;
  evidence: CallerEvidence;
  confidence: "semantic" | "unavailable";
}

/**
 * Collect callers (references) for a target file/position using semantic provider.
 */
// biome-ignore lint/complexity/useMaxParams: service function with clear positional parameters matching provider contract
export async function collectCallers(
  targetFile: string,
  targetPosition: { line: number; character: number },
  targetName: string | null,
  deps: RelationsServiceDeps,
  maxResults?: number,
): Promise<CallersResult> {
  if (!deps.provider?.references) {
    return {
      kind: "callers",
      targetName: targetName ?? "symbol",
      references: [],
      externalCount: 0,
      invalidLocationCount: 0,
      partialReason: null,
      evidence: "semantic-references",
      confidence: "unavailable",
    };
  }

  const refs = await deps.provider.references(targetFile, targetPosition);
  if (!refs) {
    return {
      kind: "callers",
      targetName: targetName ?? "symbol",
      references: [],
      externalCount: 0,
      invalidLocationCount: 0,
      partialReason: null,
      evidence: "semantic-references",
      confidence: "semantic",
    };
  }

  const normalized = normalizeProviderLocations(refs, deps.cwd);
  const normalizedTargetFile = normalizeTargetFile(targetFile, deps.cwd);
  const inProject: CallerReference[] = normalized.project
    .filter((reference) => !isTargetLocation(reference, normalizedTargetFile, targetPosition))
    .map((reference) => ({ ...reference, name: targetName }));

  void maxResults;

  return {
    kind: "callers",
    targetName: targetName ?? "symbol",
    references: inProject,
    externalCount: normalized.external.length,
    invalidLocationCount: normalized.invalidLocationCount,
    partialReason: normalized.partialReason,
    evidence: "semantic-references",
    confidence: "semantic",
  };
}
