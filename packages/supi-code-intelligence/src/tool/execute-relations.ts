import type { CodeRelationsKind } from "../intent/types.ts";
import { routeFor } from "../planner/planner.ts";
import type { CodeIntelResult } from "../types.ts";
import type { RelationsInput } from "../use-case/generate-relations.ts";
import { executeRelations } from "../use-case/generate-relations.ts";
import { getCodeProvider } from "../workspace/request-context.ts";
import { validateFocusedToolParams } from "./validation.ts";

export interface CodeRelationsToolParams {
  kind: CodeRelationsKind;
  path?: string;
  file?: string;
  line?: number;
  character?: number;
  symbol?: string;
  exportedOnly?: boolean;
  maxResults?: number;
}

/** Execute the public code_relations tool through the planner-backed routing. */
export async function executeRelationsTool(
  params: CodeRelationsToolParams,
  ctx: { cwd: string },
): Promise<CodeIntelResult> {
  const error = validateFocusedToolParams(params, ctx.cwd);
  if (error) {
    return { content: error, details: undefined };
  }

  // Semantic actions (callers, implementations) or structural (callees) require file or symbol
  if (!params.file && !params.symbol) {
    return {
      content:
        "**Error:** Relations require either anchored coordinates (`file`, `line`, `character`) or a `symbol` for discovery.",
      details: {
        type: "search" as const,
        data: {
          confidence: "unavailable" as const,
          scope: params.path ?? null,
          candidateCount: 0,
          omittedCount: 0,
          nextQueries: ["Provide `file`, `line`, `character` or a `symbol` for discovery"],
        },
      },
    };
  }

  const route = routeFor(ctx.cwd, "code_relations", params.kind);
  if (route.preferred === "unavailable") {
    return {
      content: `**Error:** No ${params.kind === "callees" ? "structural" : "semantic"} analysis provider is available for this workspace. Use tree_sitter_callees or lsp_* tools directly if needed.`,
      details: {
        type: "search" as const,
        data: {
          confidence: "unavailable" as const,
          scope: null,
          candidateCount: 0,
          omittedCount: 0,
          nextQueries: ["Check LSP and tree-sitter configuration"],
        },
      },
    };
  }

  const input: RelationsInput = {
    kind: params.kind,
    path: params.path,
    file: params.file,
    line: params.line,
    character: params.character,
    symbol: params.symbol,
    exportedOnly: params.exportedOnly,
    maxResults: params.maxResults,
  };

  const providerState = getCodeProvider(ctx.cwd);
  const provider = providerState.kind === "ready" ? providerState.provider : null;
  return executeRelations(input, { cwd: ctx.cwd, provider });
}
