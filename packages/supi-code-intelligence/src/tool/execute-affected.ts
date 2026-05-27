import { getCodeProvider } from "../analysis/context/request-context.ts";
import { routeFor } from "../analysis/routing/planner.ts";
import type { CodeIntelResult } from "../types.ts";
import { executeAffected } from "../use-case/generate-affected.ts";
import { expandTargetId } from "./target-id-params.ts";
import { validateFocusedToolParams } from "./validation.ts";

export interface CodeAffectedToolParams {
  targetId?: string;
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
  // Expand targetId if provided (takes precedence over raw coords)
  const expansion = expandTargetId(params, ctx.cwd);
  if (expansion.kind === "error") {
    return {
      content: expansion.message,
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
          nextQueries: ["Use `code_resolve` to resolve a target first"],
        },
      },
    };
  }
  if (expansion.kind === "ok") {
    params.file = expansion.file;
    params.line = expansion.line;
    params.character = expansion.character;
  }

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

  const route = routeFor(ctx.cwd, "code_affected");
  if (route.preferred === "unavailable") {
    return {
      content:
        "**Error:** No semantic analysis provider is available for this workspace. Use lsp_* tools directly if needed.",
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
          nextQueries: ["Check LSP configuration for this workspace"],
        },
      },
    };
  }

  const providerState = getCodeProvider(ctx.cwd);
  const provider = providerState.kind === "ready" ? providerState.provider : null;
  return executeAffected(params, { cwd: ctx.cwd, provider });
}
