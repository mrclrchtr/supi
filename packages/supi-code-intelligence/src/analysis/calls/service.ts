/**
 * Calls service — structural outgoing call lookup.
 *
 * V1 supports outgoing calls only. Does not claim or implement
 * true incoming call hierarchy.
 */

import type { ConfidenceMode } from "../../types.ts";
import { collectCallees } from "../relations/callees.ts";
import type { RelationsServiceDeps } from "../relations/types.ts";

export interface CallEntry {
  name: string;
  file: string;
  line: number;
}

export interface CallsResult {
  kind: "calls";
  targetName: string;
  enclosingScopeName: string;
  calls: CallEntry[];
  confidence: ConfidenceMode;
}

/**
 * Collect structural outgoing calls at a target file/position.
 */
// biome-ignore lint/complexity/useMaxParams: service wrapper matching underlying provider contract
export async function collectOutgoingCalls(
  targetFile: string,
  targetLine: number,
  targetCharacter: number,
  targetName: string | null,
  deps: RelationsServiceDeps,
  maxResults?: number,
): Promise<CallsResult> {
  const calleeResult = await collectCallees(
    targetFile,
    targetLine,
    targetCharacter,
    targetName,
    deps,
    maxResults,
  );

  return {
    kind: "calls",
    targetName: calleeResult.targetName,
    enclosingScopeName:
      calleeResult.kind === "callees" ? (targetName ?? "symbol") : (targetName ?? "symbol"),
    calls: calleeResult.callees.map((c) => ({
      name: c.name,
      file: c.file,
      line: c.line,
    })),
    confidence: calleeResult.confidence,
  };
}
