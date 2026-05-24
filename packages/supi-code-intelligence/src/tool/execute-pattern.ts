import { executePatternAction } from "../actions/pattern-action.ts";
import { createStructuralSubstrate } from "../substrates/tree-sitter-adapter.ts";
import type { CodeIntelResult } from "../types.ts";
import { validatePatternToolParams } from "./validation.ts";

export interface CodePatternToolParams {
  path?: string;
  pattern: string;
  regex?: boolean;
  kind?: string;
  maxResults?: number;
  contextLines?: number;
  summary?: boolean;
}

/** Execute the public code_pattern tool as the sole heuristic/structured search surface. */
export async function executePatternTool(
  params: CodePatternToolParams,
  ctx: { cwd: string },
): Promise<CodeIntelResult> {
  const error = validatePatternToolParams(params, ctx.cwd);
  if (error) {
    return { content: error, details: undefined };
  }

  const structural = createStructuralSubstrate(ctx.cwd);
  return executePatternAction(params, ctx.cwd, structural);
}
