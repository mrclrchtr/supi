/** Thin Pi adapter for session-owned refactor application. */

import type { CodeIntelResult, CodeIntelToolExecCtx } from "../../types/index.ts";
import { toWorkflowControl } from "../infra/workflow-control.ts";
import { finishRefactorApplyResult } from "./result.ts";

export interface CodeRefactorApplyToolParams {
  planId: string;
}

export async function executeRefactorApplyTool(
  params: CodeRefactorApplyToolParams,
  ctx: CodeIntelToolExecCtx,
): Promise<CodeIntelResult> {
  const outcome = await ctx.session.applyRefactor(params, toWorkflowControl(ctx));
  return finishRefactorApplyResult(outcome);
}
