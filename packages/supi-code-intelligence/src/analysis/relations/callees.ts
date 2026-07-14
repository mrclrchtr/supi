/**
 * Structural callee lookup — finds direct calls in the enclosing scope at a target position.
 */

import type { CalleeEntry, CalleeScope, RelationsServiceDeps } from "./types.ts";

export interface CalleesResult {
  kind: "callees";
  targetName: string;
  enclosingScope: CalleeScope | null;
  callees: CalleeEntry[];
  confidence: "structural" | "unavailable";
  depth: "direct" | "deep";
}

/**
 * Collect direct structural callees at a target file/position using the
 * enclosing executable scope reported by the structural provider.
 */
// biome-ignore lint/complexity/useMaxParams: service function with clear positional parameters matching provider contract
export async function collectCallees(
  targetFile: string,
  targetLine: number,
  targetCharacter: number,
  targetName: string | null,
  deps: RelationsServiceDeps,
  maxResults?: number,
  depth: "direct" | "deep" = "direct",
): Promise<CalleesResult> {
  if (!deps.provider?.calleesAt) {
    return unavailableCallees(targetName);
  }

  const result = await deps.provider.calleesAt(targetFile, targetLine, targetCharacter, depth);
  if (result.kind !== "success" || !result.data) {
    return unavailableCallees(targetName);
  }

  void maxResults;
  const enclosingScope = buildEnclosingScope(
    result.data.enclosingScope,
    targetFile,
    targetLine,
    targetName,
  );
  const callees: CalleeEntry[] = result.data.callees.map((c) => ({
    name: c.name,
    file: c.file ?? c.location ?? targetFile,
    line: c.startLine ?? targetLine,
    character: c.startCharacter ?? targetCharacter,
  }));

  return {
    kind: "callees",
    targetName: targetName ?? "symbol",
    enclosingScope,
    callees,
    confidence: "structural",
    depth: result.data.depth ?? depth,
  };
}

function unavailableCallees(targetName: string | null): CalleesResult {
  return {
    kind: "callees",
    targetName: targetName ?? "symbol",
    enclosingScope: null,
    callees: [],
    confidence: "unavailable",
    depth: "direct",
  };
}

function buildEnclosingScope(
  scope: { name?: string; startLine?: number; endLine?: number } | undefined,
  targetFile: string,
  targetLine: number,
  targetName: string | null,
): CalleeScope {
  const startLine = scope?.startLine ?? targetLine;
  return {
    name: scope?.name ?? targetName ?? "symbol",
    file: targetFile,
    startLine,
    endLine: scope?.endLine ?? startLine,
  };
}
