/**
 * Semantic implementation lookup — finds implementations of a target.
 */

import {
  isTargetLocation,
  normalizeProviderLocations,
  normalizeTargetFile,
  type RelationLocationPartialReason,
} from "./provider-locations.ts";
import type { ImplementationEntry, RelationsServiceDeps } from "./types.ts";

export interface ImplementationsResult {
  kind: "implementations";
  targetName: string;
  implementations: ImplementationEntry[];
  externalCount: number;
  /** Provider locations omitted because their URI or position was unusable. */
  invalidLocationCount: number;
  partialReason: RelationLocationPartialReason | null;
  confidence: "semantic" | "unavailable";
}

/**
 * Collect implementations for a target file/position using semantic provider.
 */
// biome-ignore lint/complexity/useMaxParams: service function with clear positional parameters matching provider contract
export async function collectImplementations(
  targetFile: string,
  targetPosition: { line: number; character: number },
  targetName: string | null,
  deps: RelationsServiceDeps,
  maxResults?: number,
): Promise<ImplementationsResult> {
  if (!deps.provider?.implementation) {
    return {
      kind: "implementations",
      targetName: targetName ?? "symbol",
      implementations: [],
      externalCount: 0,
      invalidLocationCount: 0,
      partialReason: null,
      confidence: "unavailable",
    };
  }

  const result = await deps.provider.implementation(targetFile, targetPosition);
  if (result.kind === "unavailable") {
    return {
      kind: "implementations",
      targetName: targetName ?? "symbol",
      implementations: [],
      externalCount: 0,
      invalidLocationCount: 0,
      partialReason: null,
      confidence: "unavailable",
    };
  }

  const normalized = normalizeProviderLocations(result.data, deps.cwd);
  const normalizedTargetFile = normalizeTargetFile(targetFile, deps.cwd);
  const project: ImplementationEntry[] = normalized.project
    .filter(
      (implementation) => !isTargetLocation(implementation, normalizedTargetFile, targetPosition),
    )
    .map((implementation) => ({ ...implementation, name: targetName }));

  void maxResults;

  return {
    kind: "implementations",
    targetName: targetName ?? "symbol",
    implementations: project,
    externalCount: normalized.external.length,
    invalidLocationCount: normalized.invalidLocationCount,
    partialReason:
      normalized.partialReason ?? (result.kind === "partial" ? "provider-limited" : null),
    confidence: "semantic",
  };
}
