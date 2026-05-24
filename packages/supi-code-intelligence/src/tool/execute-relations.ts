import { executeCalleesAction } from "../actions/callees-action.ts";
import { executeCallersAction } from "../actions/callers-action.ts";
import { executeImplementationsAction } from "../actions/implementations-action.ts";
import { createSemanticSubstrate } from "../substrates/lsp-adapter.ts";
import { createStructuralSubstrate } from "../substrates/tree-sitter-adapter.ts";
import type { CodeIntelResult } from "../types.ts";
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

/** Execute the public code_relations tool by dispatching to the selected substrate-backed relation action. */
export async function executeRelationsTool(
  params: CodeRelationsToolParams,
  ctx: { cwd: string },
): Promise<CodeIntelResult> {
  const error = validateFocusedToolParams(params, ctx.cwd);
  if (error) {
    return { content: error, details: undefined };
  }

  const actionParams = {
    path: params.path,
    file: params.file,
    line: params.line,
    character: params.character,
    symbol: params.symbol,
    exportedOnly: params.exportedOnly,
    maxResults: params.maxResults,
  };

  switch (params.kind) {
    case "callers": {
      const semantic = createSemanticSubstrate(ctx.cwd);
      return executeCallersAction(actionParams, ctx.cwd, semantic);
    }
    case "implementations": {
      const semantic = createSemanticSubstrate(ctx.cwd);
      return executeImplementationsAction(actionParams, ctx.cwd, semantic);
    }
    case "callees": {
      const structural = createStructuralSubstrate(ctx.cwd);
      const semantic = createSemanticSubstrate(ctx.cwd);
      return executeCalleesAction(actionParams, ctx.cwd, structural, semantic);
    }
  }
}
