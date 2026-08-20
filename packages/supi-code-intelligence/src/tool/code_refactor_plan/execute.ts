/** Thin Pi adapter for session-owned refactor planning. */

import type {
  RefactorOperationInput,
  RefactorPlanWorkflowInput,
} from "../../session/refactor-types.ts";
import type { RefactorTargetInput } from "../../session/target-input.ts";
import type { CodeIntelResult, CodeIntelToolExecCtx } from "../../types/index.ts";
import { toWorkflowControl } from "../infra/workflow-control.ts";
import { finishRefactorPlanResult } from "./result.ts";

export interface CodeRefactorPlanToolParams {
  target: RefactorTargetInput;
  operation: RefactorOperationInput;
}

export async function executeRefactorPlanTool(
  params: CodeRefactorPlanToolParams,
  ctx: CodeIntelToolExecCtx,
  _invokedAs: "code_refactor_plan" = "code_refactor_plan",
): Promise<CodeIntelResult> {
  const outcome = await ctx.session.planRefactor(
    params as RefactorPlanWorkflowInput,
    toWorkflowControl(ctx),
  );
  return finishRefactorPlanResult(outcome, ctx.cwd);
}
