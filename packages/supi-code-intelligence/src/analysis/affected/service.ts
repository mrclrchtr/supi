/**
 * Affected analysis service — blast radius and downstream impact.
 *
 * Delegates to the existing code_affected orchestration.
 */

import { executeAffectedTool } from "../../tool/execute-affected.ts";
import type { CodeIntelResult } from "../../types.ts";

export interface AffectedServiceInput {
  file?: string;
  line?: number;
  character?: number;
  symbol?: string;
  cwd: string;
  maxResults?: number;
}

/**
 * Execute blast-radius analysis.
 */
export async function executeAffectedService(
  input: AffectedServiceInput,
): Promise<CodeIntelResult> {
  return executeAffectedTool(
    {
      file: input.file,
      line: input.line,
      character: input.character,
      symbol: input.symbol,
      maxResults: input.maxResults,
    },
    { cwd: input.cwd },
  );
}
