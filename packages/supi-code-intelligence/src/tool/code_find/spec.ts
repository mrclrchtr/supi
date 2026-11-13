import { Type } from "typebox";
import type { CodeIntelToolExecCtx } from "../../types/index.ts";
import { FindScopesParam, FindSearchParam, MaxResultsParam } from "../schemas.ts";
import { executeFindTool } from "./execute.ts";
import { FindOutputSchema } from "./structured.ts";
import { renderFindCall, renderFindResult } from "./tui.ts";

export const CODE_FIND_TOOL_NAME = "code_find";
export const CODE_FIND_TOOL_LABEL = "Code Find";

/** Canonical provider-facing metadata for the code_find tool. */
export const codeFindSpec = {
  name: CODE_FIND_TOOL_NAME,
  label: CODE_FIND_TOOL_LABEL,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  outputSchema: FindOutputSchema,
  parameters: Type.Object(
    {
      search: FindSearchParam,
      scopes: Type.Optional(FindScopesParam),
      maxResults: Type.Optional(MaxResultsParam),
    },
    { additionalProperties: false },
  ),
  run: (params: unknown, ctx: CodeIntelToolExecCtx) =>
    executeFindTool(params as Parameters<typeof executeFindTool>[0], ctx),
  renderCall: renderFindCall,
  renderResult: renderFindResult,
} as const;
