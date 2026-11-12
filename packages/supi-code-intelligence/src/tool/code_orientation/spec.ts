import { Type } from "typebox";
import type { CodeIntelToolExecCtx } from "../../types/index.ts";
import { MaxResultsParam, OrientationFocusParam } from "../schemas.ts";
import { executeOrientationTool } from "./execute.ts";
import { OrientationOutputSchema } from "./structured-schema.ts";
import { renderOrientationCall, renderOrientationResult } from "./tui.ts";

export const CODE_ORIENTATION_TOOL_NAME = "code_orientation";
export const CODE_ORIENTATION_TOOL_LABEL = "Code Orientation";

/** Canonical provider-facing metadata for the code_orientation tool. */
export const codeOrientationSpec = {
  name: CODE_ORIENTATION_TOOL_NAME,
  label: CODE_ORIENTATION_TOOL_LABEL,
  // Read-only by default. Gradle observation runs project build logic only after an explicit
  // per-project allow; that consent covers its effects, so the hints describe the default path.
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  outputSchema: OrientationOutputSchema,
  parameters: Type.Object(
    {
      focus: Type.Optional(OrientationFocusParam),
      maxResults: Type.Optional(MaxResultsParam),
    },
    { additionalProperties: false },
  ),
  run: (params: unknown, ctx: CodeIntelToolExecCtx) =>
    executeOrientationTool(params as Parameters<typeof executeOrientationTool>[0], ctx),
  renderCall: renderOrientationCall,
  renderResult: renderOrientationResult,
} as const;
