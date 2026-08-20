import { Type } from "typebox";
import type { CodeIntelToolExecCtx } from "../../types/index.ts";
import { MaxResultsParam, ResolveTargetParam } from "../schemas.ts";
import { executeResolveTool } from "./execute.ts";

export const CODE_RESOLVE_TOOL_NAME = "code_resolve";
export const CODE_RESOLVE_TOOL_LABEL = "Code Resolve";

/** Canonical provider-facing metadata for the code_resolve tool. */
export const codeResolveSpec = {
  name: CODE_RESOLVE_TOOL_NAME,
  label: CODE_RESOLVE_TOOL_LABEL,
  parameters: Type.Object(
    {
      target: ResolveTargetParam,
      maxResults: Type.Optional(MaxResultsParam),
    },
    { additionalProperties: false },
  ),
  run: (params: unknown, ctx: CodeIntelToolExecCtx) =>
    executeResolveTool(params as Parameters<typeof executeResolveTool>[0], ctx),
} as const;
