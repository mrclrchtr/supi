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

interface CallerEvidenceData {
  kind: "callers";
  targetName: string;
  references: CallerReference[];
  externalCount: number;
  /** Provider locations omitted because their URI or position was unusable. */
  invalidLocationCount: number;
  partialReason: RelationLocationPartialReason | null;
  evidence: CallerEvidence;
}

/** Reference evidence, or the provider reason that prevented collection. */
export type CallersResult = CallerEvidenceData &
  ({ confidence: "semantic" } | { confidence: "unavailable"; message: string });

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
      message: "No semantic references provider",
    };
  }

  const result = await deps.provider.references(targetFile, targetPosition);
  if (result.kind === "unavailable") {
    return {
      kind: "callers",
      targetName: targetName ?? "symbol",
      references: [],
      externalCount: 0,
      invalidLocationCount: 0,
      partialReason: null,
      evidence: "semantic-references",
      confidence: "unavailable",
      message: result.reason,
    };
  }

  const normalized = normalizeProviderLocations(result.data, deps.cwd);
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
    partialReason: result.kind === "partial" ? "provider-limited" : normalized.partialReason,
    evidence: "semantic-references",
    confidence: "semantic",
  };
}
