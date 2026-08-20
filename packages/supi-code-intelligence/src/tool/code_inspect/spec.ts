import { Type } from "typebox";
import type { CodeIntelToolExecCtx } from "../../types/index.ts";
import { MaxResultsParam, SourcePointParam } from "../schemas.ts";
import { executeInspectTool } from "./execute.ts";

export const CODE_INSPECT_TOOL_NAME = "code_inspect";
export const CODE_INSPECT_TOOL_LABEL = "Code Inspect";

/** Canonical provider-facing metadata for the code_inspect tool. */
export const codeInspectSpec = {
  name: CODE_INSPECT_TOOL_NAME,
  label: CODE_INSPECT_TOOL_LABEL,
  parameters: Type.Object(
    {
      point: SourcePointParam,
      maxResults: Type.Optional(MaxResultsParam),
    },
    { additionalProperties: false },
  ),
  run: (params: unknown, ctx: CodeIntelToolExecCtx) =>
    executeInspectTool(params as Parameters<typeof executeInspectTool>[0], ctx),
} as const;
