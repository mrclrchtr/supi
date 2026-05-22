import { executeCalleesAction } from "../actions/callees-action.ts";
import { executeCallersAction } from "../actions/callers-action.ts";
import { executeImplementationsAction } from "../actions/implementations-action.ts";
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

const RELATION_HANDLERS = {
  callers: executeCallersAction,
  callees: executeCalleesAction,
  implementations: executeImplementationsAction,
} as const;

/** Execute the public code_relations tool by dispatching to the selected substrate-backed relation action. */
export async function executeRelationsTool(
  params: CodeRelationsToolParams,
  ctx: { cwd: string },
): Promise<CodeIntelResult> {
  const error = validateFocusedToolParams(params, ctx.cwd);
  if (error) {
    return { content: error, details: undefined };
  }

  const handler = RELATION_HANDLERS[params.kind];
  return handler(
    {
      path: params.path,
      file: params.file,
      line: params.line,
      character: params.character,
      symbol: params.symbol,
      exportedOnly: params.exportedOnly,
      maxResults: params.maxResults,
    },
    ctx.cwd,
  );
}
