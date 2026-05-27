import { getCodeProvider } from "../analysis/context/request-context.ts";
import type { CodeIntelResult } from "../types.ts";
import { executePattern } from "../use-case/generate-pattern.ts";
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

/** Execute the public code_pattern tool through the pattern use-case. */
export async function executePatternTool(
  params: CodePatternToolParams,
  ctx: { cwd: string },
): Promise<CodeIntelResult> {
  const error = validatePatternToolParams(params, ctx.cwd);
  if (error) {
    return { content: error, details: undefined };
  }

  const providerState = getCodeProvider(ctx.cwd);
  const provider = providerState.kind === "ready" ? providerState.provider : null;
  return executePattern(params, { cwd: ctx.cwd, provider });
}
