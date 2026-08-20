import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import type { CodeIntelToolExecCtx } from "../../types/index.ts";
import { FindScopeParam, MaxResultsParam, QueryParam } from "../schemas.ts";
import { CODE_FIND_AST_KINDS } from "./ast-kinds.ts";
import { executeFindTool } from "./execute.ts";
import { CODE_FIND_MODES } from "./modes.ts";

export const CODE_FIND_TOOL_NAME = "code_find";
export const CODE_FIND_TOOL_LABEL = "Code Find";

/** Canonical provider-facing metadata for the code_find tool. */
export const codeFindSpec = {
  name: CODE_FIND_TOOL_NAME,
  label: CODE_FIND_TOOL_LABEL,
  parameters: Type.Object(
    {
      query: QueryParam,
      scope: Type.Optional(FindScopeParam),
      mode: StringEnum(CODE_FIND_MODES, {
        description: 'Required code-aware search mode. mode:"ast" requires `kind`.',
      }),
      kind: Type.Optional(
        StringEnum(CODE_FIND_AST_KINDS, {
          description: 'AST kind for mode:"ast".',
        }),
      ),
      maxResults: Type.Optional(MaxResultsParam),
    },
    { additionalProperties: false },
  ),
  run: (params: unknown, ctx: CodeIntelToolExecCtx) =>
    executeFindTool(params as Parameters<typeof executeFindTool>[0], ctx),
} as const;
