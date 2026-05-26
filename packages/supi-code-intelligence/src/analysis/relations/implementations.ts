/**
 * Semantic implementation lookup — finds implementations of a target.
 */

import type { ImplementationEntry, RelationsServiceDeps } from "./types.ts";

export interface ImplementationsResult {
  kind: "implementations";
  targetName: string;
  implementations: ImplementationEntry[];
  externalCount: number;
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
      confidence: "unavailable",
    };
  }

  const impls = await deps.provider.implementation(targetFile, targetPosition);
  if (!impls) {
    return {
      kind: "implementations",
      targetName: targetName ?? "symbol",
      implementations: [],
      externalCount: 0,
      confidence: "semantic",
    };
  }

  const project: ImplementationEntry[] = [];
  let externalCount = 0;

  for (const loc of impls) {
    const uri = loc.uri ?? loc.targetUri ?? "";
    const filePath = uri.startsWith("file://") ? uri.slice(7) : uri;
    const line = (loc.range?.start?.line ?? loc.targetRange?.start?.line ?? 0) + 1;

    if (filePath?.startsWith(deps.cwd)) {
      project.push({
        file: filePath,
        line,
        character: 0,
        name: targetName,
      });
    } else {
      externalCount++;
    }
  }

  const limit = maxResults ?? 8;
  const limited = project.slice(0, limit);

  return {
    kind: "implementations",
    targetName: targetName ?? "symbol",
    implementations: limited,
    externalCount,
    confidence: "semantic",
  };
}
