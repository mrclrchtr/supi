/** Thin Pi adapter for code_resolve. */

import type { ResolveTargetInput } from "../../session/target-input.ts";
import type { CodeIntelResult, CodeIntelToolExecCtx } from "../../types/index.ts";
import { toWorkflowControl } from "../infra/workflow-control.ts";
import { finishResolveResult } from "./result.ts";

export interface CodeResolveToolParams {
  target: ResolveTargetInput;
  maxResults?: number;
}

export async function executeResolveTool(
  params: CodeResolveToolParams,
  ctx: CodeIntelToolExecCtx,
): Promise<CodeIntelResult> {
  const outcome = await ctx.session.resolve(params, toWorkflowControl(ctx));
  return finishResolveResult(outcome, ctx.cwd);
}
