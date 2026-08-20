import { Type } from "typebox";
import type { CodeIntelToolExecCtx } from "../../types/index.ts";
import { RefactorOperationParam, RefactorTargetParam } from "../schemas.ts";
import { executeRefactorPlanTool } from "./execute.ts";

export const CODE_REFACTOR_PLAN_TOOL_NAME = "code_refactor_plan";
export const CODE_REFACTOR_PLAN_TOOL_LABEL = "Code Refactor Plan";

/** Canonical provider-facing metadata for the code_refactor_plan tool. */
export const codeRefactorPlanSpec = {
  name: CODE_REFACTOR_PLAN_TOOL_NAME,
  label: CODE_REFACTOR_PLAN_TOOL_LABEL,
  parameters: Type.Object(
    {
      target: RefactorTargetParam,
      operation: RefactorOperationParam,
    },
    { additionalProperties: false },
  ),
  run: (params: unknown, ctx: CodeIntelToolExecCtx) =>
    executeRefactorPlanTool(params as Parameters<typeof executeRefactorPlanTool>[0], ctx),
} as const;
