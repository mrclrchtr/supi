/**
 * Calls service — direct structural outgoing-call lookup.
 *
 * V1 reports direct structural callees only. It does not claim or implement
 * true incoming call hierarchy or symbol-identity resolution.
 */

import type { ConfidenceMode } from "../../types.ts";
import { collectCallees } from "../relations/callees.ts";
import type { CalleeScope, RelationsServiceDeps } from "../relations/types.ts";

export interface CallEntry {
  name: string;
  file: string;
  line: number;
}

export interface CallsResult {
  kind: "calls";
  targetName: string;
  enclosingScope: CalleeScope;
  calls: CallEntry[];
  confidence: ConfidenceMode;
}

/**
 * Collect direct structural calls at a target file/position.
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
    enclosingScope: calleeResult.enclosingScope ?? {
      name: targetName ?? "symbol",
      file: targetFile,
      startLine: targetLine,
      endLine: targetLine,
    },
    calls: calleeResult.callees.map((c) => ({
      name: c.name,
      file: c.file,
      line: c.line,
    })),
    confidence: calleeResult.confidence,
  };
}
