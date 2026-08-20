import { Type } from "typebox";
import type { CodeIntelToolExecCtx } from "../../types/index.ts";
import { executeRefactorApplyTool } from "./execute.ts";
import { renderRefactorApplyCall, renderRefactorApplyResult } from "./tui.ts";

export const CODE_REFACTOR_APPLY_TOOL_NAME = "code_refactor_apply";
export const CODE_REFACTOR_APPLY_TOOL_LABEL = "Code Refactor Apply";

/** Canonical provider-facing metadata for the code_refactor_apply tool. */
export const codeRefactorApplySpec = {
  name: CODE_REFACTOR_APPLY_TOOL_NAME,
  label: CODE_REFACTOR_APPLY_TOOL_LABEL,
  parameters: Type.Object(
    {
      planId: Type.String({
        description: "planId returned by code_refactor_plan.",
        minLength: 1,
      }),
    },
    { additionalProperties: false },
  ),
  run: (params: unknown, ctx: CodeIntelToolExecCtx) =>
    executeRefactorApplyTool(params as Parameters<typeof executeRefactorApplyTool>[0], ctx),
  renderCall: renderRefactorApplyCall,
  renderResult: renderRefactorApplyResult,
} as const;
