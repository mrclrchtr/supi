/**
 * Implementation service — semantic implementation lookup.
 *
 * Uses LSP implementation to find implementations of an interface,
 * class, or abstract method.
 */

import type { ConfidenceMode } from "../../types.ts";
import { collectImplementations } from "../relations/implementations.ts";
import type { RelationsServiceDeps } from "../relations/types.ts";

export interface ImplementationEntry {
  file: string;
  line: number;
  name: string | null;
}

export interface ImplementationsResult {
  kind: "implementations";
  targetName: string;
  implementations: ImplementationEntry[];
  externalCount: number;
  confidence: ConfidenceMode;
}

/**
 * Collect semantic implementations for a target file/position.
 */
// biome-ignore lint/complexity/useMaxParams: service wrapper matching underlying provider contract
export async function collectServiceImplementations(
  targetFile: string,
  targetPosition: { line: number; character: number },
  targetName: string | null,
  deps: RelationsServiceDeps,
  maxResults?: number,
): Promise<ImplementationsResult> {
  const implResult = await collectImplementations(
    targetFile,
    targetPosition,
    targetName,
    deps,
    maxResults,
  );

  return {
    kind: "implementations",
    targetName: implResult.targetName,
    implementations: implResult.implementations.map((i) => ({
      file: i.file,
      line: i.line,
      name: i.name,
    })),
    externalCount: implResult.externalCount,
    confidence: implResult.confidence,
  };
}
