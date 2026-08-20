import { Type } from "typebox";
import type { CodeIntelToolExecCtx } from "../../types/index.ts";
import { MaxResultsParam, OrientationFocusParam } from "../schemas.ts";
import { executeOrientationTool } from "./execute.ts";

export const CODE_ORIENTATION_TOOL_NAME = "code_orientation";
export const CODE_ORIENTATION_TOOL_LABEL = "Code Orientation";

/** Canonical provider-facing metadata for the code_orientation tool. */
export const codeOrientationSpec = {
  name: CODE_ORIENTATION_TOOL_NAME,
  label: CODE_ORIENTATION_TOOL_LABEL,
  parameters: Type.Object(
    {
      focus: Type.Optional(OrientationFocusParam),
      maxResults: Type.Optional(MaxResultsParam),
    },
    { additionalProperties: false },
  ),
  run: (params: unknown, ctx: CodeIntelToolExecCtx) =>
    executeOrientationTool(params as Parameters<typeof executeOrientationTool>[0], ctx),
} as const;
