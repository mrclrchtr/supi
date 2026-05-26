/**
 * Structural callee lookup — finds outgoing calls at a target position.
 */

import type { CalleeEntry, RelationsServiceDeps } from "./types.ts";

export interface CalleesResult {
  kind: "callees";
  targetName: string;
  callees: CalleeEntry[];
  confidence: "structural" | "unavailable";
}

/**
 * Collect callees at a target file/position using structural provider.
 */
// biome-ignore lint/complexity/useMaxParams: service function with clear positional parameters matching provider contract
export async function collectCallees(
  targetFile: string,
  targetLine: number,
  targetCharacter: number,
  targetName: string | null,
  deps: RelationsServiceDeps,
  maxResults?: number,
): Promise<CalleesResult> {
  if (!deps.provider?.calleesAt) {
    return {
      kind: "callees",
      targetName: targetName ?? "symbol",
      callees: [],
      confidence: "unavailable",
    };
  }

  const result = await deps.provider.calleesAt(targetFile, targetLine, targetCharacter);
  if (result.kind !== "success" || !result.data) {
    return {
      kind: "callees",
      targetName: targetName ?? "symbol",
      callees: [],
      confidence: "unavailable",
    };
  }

  const callees: CalleeEntry[] = result.data.callees.slice(0, maxResults ?? 8).map((c) => ({
    name: c.name,
    file: c.file ?? c.location ?? targetFile,
    line: 0,
    character: 0,
  }));

  return {
    kind: "callees",
    targetName: targetName ?? "symbol",
    callees,
    confidence: "structural",
  };
}
