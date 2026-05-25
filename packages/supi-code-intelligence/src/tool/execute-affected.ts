import type { CodeIntelResult } from "../types.ts";
import { executeAffected } from "../use-case/generate-affected.ts";
import { getCodeProvider } from "../workspace/request-context.ts";
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

  // Semantic actions require file or symbol
  if (!params.file && !params.symbol) {
    return {
      content:
        "**Error:** Semantic actions require either anchored coordinates (`file`, `line`, `character`) or a `symbol` for discovery.",
      details: {
        type: "affected" as const,
        data: {
          confidence: "unavailable" as const,
          directCount: 0,
          downstreamCount: 0,
          riskLevel: "low" as const,
          checkNext: [],
          likelyTests: [],
          omittedCount: 0,
          nextQueries: ["Provide `file`, `line`, `character` or a `symbol` for discovery"],
        },
      },
    };
  }

  const providerState = getCodeProvider(ctx.cwd);
  const provider = providerState.kind === "ready" ? providerState.provider : null;
  return executeAffected(params, { cwd: ctx.cwd, provider });
}
