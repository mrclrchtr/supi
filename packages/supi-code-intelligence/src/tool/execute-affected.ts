import type { CodeIntelResult } from "../types.ts";
import { type CodeImpactToolParams, executeImpactLikeTool } from "./execute-impact.ts";

export interface CodeAffectedToolParams
  extends Pick<
    CodeImpactToolParams,
    "targetId" | "file" | "line" | "character" | "symbol" | "exportedOnly" | "maxResults"
  > {}

/** Execute the compatibility code_affected tool through the shared impact executor. */
export async function executeAffectedTool(
  params: CodeAffectedToolParams,
  ctx: { cwd: string },
): Promise<CodeIntelResult> {
  return executeImpactLikeTool(params, ctx, "affected");
}
