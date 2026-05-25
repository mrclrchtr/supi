import { getCodeProvider } from "../provider/registry.ts";
import type { CodeIntelResult } from "../types.ts";
import type { RelationsInput } from "../use-case/generate-relations.ts";
import { executeRelations } from "../use-case/generate-relations.ts";
import type { CodeRelationsKind } from "./tool-specs.ts";
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

/** Execute the public code_relations tool through the relations use-case. */
export async function executeRelationsTool(
  params: CodeRelationsToolParams,
  ctx: { cwd: string },
): Promise<CodeIntelResult> {
  const error = validateFocusedToolParams(params, ctx.cwd);
  if (error) {
    return { content: error, details: undefined };
  }

  // Semantic actions (callers, callees, implementations) require file or symbol
  if (!params.file && !params.symbol) {
    return {
      content:
        "**Error:** Semantic actions require either anchored coordinates (`file`, `line`, `character`) or a `symbol` for discovery.",
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
