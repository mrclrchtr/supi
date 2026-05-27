/**
 * Reference service — semantic reference collection over resolved targets.
 *
 * Uses LSP references to find usages of a symbol and labels them as
 * references/usages, not callers.
 */

import { uriToFile } from "../../search-helpers.ts";
import type { ConfidenceMode } from "../../types.ts";
import { collectCallers } from "../relations/callers.ts";
import type { RelationsServiceDeps } from "../relations/types.ts";

export interface ReferenceEntry {
  file: string;
  line: number;
  character: number;
  name: string | null;
}

export interface ReferencesResult {
  kind: "references";
  targetName: string;
  references: ReferenceEntry[];
  externalCount: number;
  confidence: ConfidenceMode;
}

/**
 * Collect semantic references for a target file/position.
 *
 * Filters out the declaration position from LSP results
 * so references reports usages, not the definition itself.
 */
export async function collectReferences(
  targetFile: string,
  targetPosition: { line: number; character: number },
  targetName: string | null,
  deps: RelationsServiceDeps,
  maxResults?: number,
): Promise<ReferencesResult> {
  const callerResult = await collectCallers(
    targetFile,
    targetPosition,
    targetName,
    deps,
    maxResults,
  );

  // Filter out the declaration position (target file + position)
  const filtered = callerResult.references.filter((r) => {
    const resolvedFile = r.file.startsWith("file://") ? uriToFile(r.file) : r.file;
    const targetResolved = targetFile.startsWith("file://") ? uriToFile(targetFile) : targetFile;
    if (resolvedFile !== targetResolved && resolvedFile !== targetFile) return true;
    // 1-based display lines vs 0-based LSP lines + 1
    if (r.line === targetPosition.line + 1 && r.character === targetPosition.character + 1)
      return false;
    return true;
  });

  return {
    kind: "references",
    targetName: callerResult.targetName,
    references: filtered.map((r) => ({
      file: r.file,
      line: r.line,
      character: r.character,
      name: r.name,
    })),
    externalCount: callerResult.externalCount,
    confidence: callerResult.confidence,
  };
}
