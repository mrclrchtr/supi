import type { CodeIntelResult } from "../types.ts";
import { executeAffected } from "../use-case/generate-affected.ts";
import { validateFocusedToolParams } from "./validation.ts";

export interface CodeAffectedToolParams {
  file?: string;
  line?: number;
  character?: number;
  symbol?: string;
  exportedOnly?: boolean;
  maxResults?: number;
}

/** Execute the public code_affected tool through the affected use-case. */
export async function executeAffectedTool(
  params: CodeAffectedToolParams,
  ctx: { cwd: string },
): Promise<CodeIntelResult> {
  const error = validateFocusedToolParams(params, ctx.cwd);
  if (error) {
    return { content: error, details: undefined };
  }

  return executeAffected(params, { cwd: ctx.cwd });
}
