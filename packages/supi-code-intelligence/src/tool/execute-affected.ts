import { executeAffectedAction } from "../actions/affected-action.ts";
import type { CodeIntelResult } from "../types.ts";
import { validateFocusedToolParams } from "./validation.ts";

export interface CodeAffectedToolParams {
  file?: string;
  line?: number;
  character?: number;
  symbol?: string;
  exportedOnly?: boolean;
  maxResults?: number;
}

/** Execute the public code_affected tool through the substrate-only affected action. */
export async function executeAffectedTool(
  params: CodeAffectedToolParams,
  ctx: { cwd: string },
): Promise<CodeIntelResult> {
  const error = validateFocusedToolParams(params, ctx.cwd);
  if (error) {
    return { content: error, details: undefined };
  }

  return executeAffectedAction(params, ctx.cwd);
}
