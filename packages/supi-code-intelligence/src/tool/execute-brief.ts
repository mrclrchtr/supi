import { executeBriefAction } from "../actions/brief-action.ts";
import type { CodeIntelResult } from "../types.ts";
import { validateFocusedToolParams } from "./validation.ts";

export interface CodeBriefToolParams {
  path?: string;
  file?: string;
  line?: number;
  character?: number;
  symbol?: string;
  maxResults?: number;
}

/** Execute the public code_brief tool through the existing brief action. */
export async function executeBriefTool(
  params: CodeBriefToolParams,
  ctx: { cwd: string },
): Promise<CodeIntelResult> {
  const error = validateFocusedToolParams(params, ctx.cwd);
  if (error) {
    return { content: error, details: undefined };
  }

  return executeBriefAction(params, ctx.cwd);
}
