/** Thin Pi adapter for the session-owned code_health workflow. */

import type { HealthSection, HealthWorkflowInput } from "../../session/health-types.ts";
import type { CodeIntelResult, CodeIntelToolExecCtx } from "../../types/index.ts";
import { toWorkflowControl } from "../infra/workflow-control.ts";
import { finishHealthResult } from "./result.ts";

export interface CodeHealthToolParams {
  scope?: string;
  refresh?: boolean;
  include?: HealthSection[];
  level?: "summary" | "detailed";
}

export async function executeHealthTool(
  params: CodeHealthToolParams,
  ctx: CodeIntelToolExecCtx,
): Promise<CodeIntelResult> {
  const outcome = await ctx.session.health(params as HealthWorkflowInput, toWorkflowControl(ctx));
  return finishHealthResult(outcome, ctx.cwd);
}
