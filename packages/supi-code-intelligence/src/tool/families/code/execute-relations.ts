/**
 * code_relations tool edge — validate → build context → call service → render.
 *
 * Currently delegates to the existing tool/execute-relations.ts. When the
 * relations analysis service and new typed result rendering are complete,
 * this module will become the canonical entry point.
 */

import type { CodeIntelResult } from "../../../types.ts";
import { executeRelationsTool } from "../../execute-relations.ts";

/**
 * Execute a code_relations tool call.
 *
 * Delegates to the existing tool edge until the new relations service
 * and typed result rendering are fully wired.
 */
export async function executeCodeRelationsTool(
  params: {
    kind: "callers" | "callees" | "implementations";
    path?: string;
    file?: string;
    line?: number;
    character?: number;
    symbol?: string;
    maxResults?: number;
  },
  ctx: { cwd: string },
): Promise<CodeIntelResult> {
  return executeRelationsTool(
    {
      kind: params.kind,
      path: params.path,
      file: params.file,
      line: params.line,
      character: params.character,
      symbol: params.symbol,
      maxResults: params.maxResults,
    },
    ctx,
  );
}
