/**
 * Pattern search service — literal, regex, or structured search.
 *
 * Delegates to the existing code_pattern orchestration.
 */

import { executePatternTool } from "../../tool/execute-pattern.ts";
import type { CodeIntelResult } from "../../types.ts";

export interface PatternServiceInput {
  pattern: string;
  path?: string;
  regex?: boolean;
  kind?: string;
  maxResults?: number;
  contextLines?: number;
  summary?: boolean;
  cwd: string;
}

/**
 * Execute a pattern search.
 */
export async function executePatternService(input: PatternServiceInput): Promise<CodeIntelResult> {
  return executePatternTool(
    {
      path: input.path,
      pattern: input.pattern,
      regex: input.regex,
      kind: input.kind,
      maxResults: input.maxResults,
      contextLines: input.contextLines,
      summary: input.summary,
    },
    { cwd: input.cwd },
  );
}
