/**
 * Semantic caller collection — finds references for a target.
 *
 * Returns typed caller data with explicit evidence metadata
 * ("semantic-references" since we use LSP references as caller evidence).
 */

import type { CallerEvidence, CallerReference, RelationsServiceDeps } from "./types.ts";

export interface CallersResult {
  kind: "callers";
  targetName: string;
  references: CallerReference[];
  externalCount: number;
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
      evidence: "semantic-references",
      confidence: "semantic",
    };
  }

  const inProject: CallerReference[] = [];
  let externalCount = 0;

  for (const ref of refs) {
    const uri = ref.uri ?? "";
    const filePath = uri.startsWith("file://") ? uri.slice(7) : uri;
    if (filePath.startsWith(deps.cwd)) {
      inProject.push({
        file: filePath,
        line: ref.range.start.line + 1,
        character: ref.range.start.character + 1,
        name: targetName,
      });
    } else {
      externalCount++;
    }
  }

  const limit = maxResults ?? 5;
  const limited = inProject.slice(0, limit);

  return {
    kind: "callers",
    targetName: targetName ?? "symbol",
    references: limited,
    externalCount,
    evidence: "semantic-references",
    confidence: "semantic",
  };
}
